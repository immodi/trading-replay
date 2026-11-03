import { useCallback, useEffect, useMemo, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import { useStore } from "@/hooks/useStore";
import type { Store } from "@/store/store";
import type { PersistedSessionState } from "@/types/persistedSession";
import type { Position } from "@/types/position";
import type { SessionSummary, SessionTrade } from "@/types/session";
import { buildSessionExport } from "@/utils/buildSessionExport";
import {
    calculateCommission,
    calculateGrossProfitLoss,
    calculatePositionPL,
} from "@/utils/calculatePositionPL";
import { downloadJson } from "@/utils/downloadJson";

type UseTradingSessionOptions = {
    /** Every position tracked by the trade engine. */
    positions: Position[];
    /** Instrument/symbol label from the active source config. */
    instrument: string;
    /** Dollars per point from the active source config. */
    pointValue: number;
    /** Commission in dollars per contract, per side. */
    commissionPerSide: number;
    /** Persisted session for the active source. */
    store: Store<PersistedSessionState>;
    /** Raw-candle index of the replay tick currently being displayed. */
    replayIndex: number;
    /** UTC day (YYYY-MM-DD) of the tick currently being displayed. */
    replayDay: string;
};

/** Build the session record for a position that has a realised exit. */
function toSessionTrade(
    position: Position,
    instrument: string,
    pointValue: number,
    commissionPerSide: number,
    replayIndex: number,
    replayDay: string,
): SessionTrade {
    return {
        id: position.id,
        instrument,
        direction: position.side,
        quantity: position.quantity,
        entryPrice: position.entryPrice,
        exitPrice: position.exitPrice ?? position.entryPrice,
        entryTime: position.entryTime,
        exitTime: (position.exitTime ?? position.entryTime) as UTCTimestamp,
        totalCommission: calculateCommission(position.quantity, commissionPerSide),
        grossProfitLoss: calculateGrossProfitLoss(position, pointValue),
        netProfitLoss: calculatePositionPL(position, pointValue, commissionPerSide),
        replayIndex,
        replayDay,
    };
}

/** Filesystem‑safe timestamp for the export file name. */
function fileTimestamp(date: Date): string {
    return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Tracks completed trades for the active source. Trades are kept in a
 * singleton store that mirrors them to localStorage, so a refresh restores
 * the session instead of discarding it.
 */
export function useTradingSession({
    positions,
    instrument,
    pointValue,
    commissionPerSide,
    store,
    replayIndex,
    replayDay,
}: UseTradingSessionOptions) {
    const state = useStore(store);
    const trades = state.trades;

    // Seed both guards from the restored session so a reload cannot record a
    // trade twice or resurrect one the user removed.
    const recordedIdsRef = useRef<Set<string> | null>(null);
    const removedIdsRef = useRef<Set<string> | null>(null);

    if (recordedIdsRef.current === null) {
        recordedIdsRef.current = new Set(
            state.trades.map((trade) => trade.id),
        );
    }
    if (removedIdsRef.current === null) {
        removedIdsRef.current = new Set(state.removedTradeIds);
    }

    const recordedIds = recordedIdsRef.current;
    const removedIds = removedIdsRef.current;

    const markTradesChanged = useCallback(
        (current: PersistedSessionState, nextTrades: SessionTrade[]) => ({
            ...current,
            trades: nextTrades,
            tradesUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        }),
        [],
    );

    // Record each completed position exactly once, even if it later disappears
    // from the trade engine (Reset / date change) or the effect re-runs.
    useEffect(() => {
        const unreported = positions.filter(
            (position) =>
                position.state === "close" &&
                position.exitPrice !== undefined &&
                !recordedIds.has(position.id) &&
                !removedIds.has(position.id),
        );

        if (unreported.length === 0) return;

        const recorded = unreported.map((position) => {
            recordedIds.add(position.id);
            return toSessionTrade(
                position,
                instrument,
                pointValue,
                commissionPerSide,
                replayIndex,
                replayDay,
            );
        });

        store.update((current) =>
            markTradesChanged(current, [...current.trades, ...recorded]),
        );
        store.save();
    }, [
        positions,
        instrument,
        pointValue,
        commissionPerSide,
        store,
        recordedIds,
        removedIds,
        markTradesChanged,
        replayIndex,
        replayDay,
    ]);

    // Rewinding removes completed trades that belong to the part of the
    // replay the user has just left behind. The trade engine reopens the
    // matching positions from its snapshot; the session list must agree.
    const previousReplayRef = useRef<{ index: number; day: string } | null>(
        null,
    );

    useEffect(() => {
        const previous = previousReplayRef.current;
        previousReplayRef.current = { index: replayIndex, day: replayDay };

        if (
            previous === null ||
            previous.day !== replayDay ||
            replayIndex >= previous.index
        ) {
            return;
        }

        const staleIds = new Set(
            state.trades
                .filter(
                    (trade) =>
                        trade.replayDay === replayDay &&
                        (trade.replayIndex ?? -1) > replayIndex,
                )
                .map((trade) => trade.id),
        );

        if (staleIds.size === 0) return;

        for (const id of staleIds) {
            recordedIds.delete(id);
        }

        store.update((current) =>
            markTradesChanged(
                current,
                current.trades.filter((trade) => !staleIds.has(trade.id)),
            ),
        );
        store.save();
    }, [
        replayIndex,
        replayDay,
        state.trades,
        store,
        recordedIds,
        markTradesChanged,
    ]);

    const removeTrade = useCallback(
        (id: string) => {
            removedIds.add(id);
            store.update((current) =>
                markTradesChanged(
                    {
                        ...current,
                        removedTradeIds: current.removedTradeIds.includes(id)
                            ? current.removedTradeIds
                            : [...current.removedTradeIds, id],
                    },
                    current.trades.filter((trade) => trade.id !== id),
                ),
            );
            store.save();
        },
        [markTradesChanged, removedIds, store],
    );

    const summary = useMemo<SessionSummary>(
        () => ({
            tradeCount: trades.length,
            totalNetProfitLoss: trades.reduce(
                (total, trade) => total + trade.netProfitLoss,
                0,
            ),
            totalCommission: trades.reduce(
                (total, trade) => total + trade.totalCommission,
                0,
            ),
        }),
        [trades],
    );

    // Playback/view writes must not mark the session as unexported, which is
    // why only trade changes bump `tradesUpdatedAt`.
    const hasUnexportedChanges =
        trades.length > 0 &&
        (state.lastExportedAt === null ||
            state.tradesUpdatedAt > state.lastExportedAt);

    const exportSession = useCallback(() => {
        const payload = buildSessionExport({
            trades,
            summary,
            instrument,
            pointValue,
            commissionPerSide,
        });

        const safeInstrument = (instrument || "session")
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-+|-+$/g, "");

        downloadJson(
            `tradereplay-session-${safeInstrument || "session"}-${fileTimestamp(new Date())}.json`,
            payload,
        );

        store.patch({ lastExportedAt: Date.now() });
        store.save();
    }, [trades, summary, instrument, pointValue, commissionPerSide, store]);

    return {
        trades,
        summary,
        hasUnexportedChanges,
        removeTrade,
        exportSession,
    };
}
