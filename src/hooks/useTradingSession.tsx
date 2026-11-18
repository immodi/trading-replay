import { useCallback, useEffect, useMemo, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import type { AssetClass } from "@/constants/assetClass";
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
    type CommissionSettings,
} from "@/utils/calculatePositionPL";
import { downloadJson } from "@/utils/downloadJson";

type UseTradingSessionOptions = {
    /** Every position tracked by the trade engine. */
    positions: Position[];
    /** Instrument/symbol label from the active source config. */
    instrument: string;
    /** Market family of the active source. */
    assetClass?: AssetClass;
    /** Raw dataset resolution in minutes. */
    baseTimeframeMinutes?: number;
    /** Reporting currency for exported metadata. */
    currency?: string;
    /** Currency value of one point from the active source config. */
    pointValue: number;
    /** Flat commission per side, in the source currency. */
    commissionPerSide: number;
    /** Percentage commission per side. */
    commissionPercent: number;
    /** Persisted session for the active source. */
    store: Store<PersistedSessionState>;
    /** Raw-candle index of the replay tick currently being displayed. */
    replayIndex: number;
    /** UTC day (YYYY-MM-DD) of the tick currently being displayed. */
    replayDay: string;
    /**
     * UTC day that anchors the current replay block (the date picked by the
     * user). Daily replays keep advancing across days without changing it, so
     * it distinguishes rewinding from switching to another date.
     */
    replayWindowDay?: string;
};

/** Build the session record for a position that has a realised exit. */
function toSessionTrade(
    position: Position,
    instrument: string,
    pointValue: number,
    commission: CommissionSettings,
    replayIndex: number,
    replayDay: string,
    replayWindowDay: string,
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
        totalCommission: calculateCommission(
            position.entryPrice,
            position.exitPrice ?? position.entryPrice,
            position.quantity,
            commission,
        ),
        grossProfitLoss: calculateGrossProfitLoss(position, pointValue),
        netProfitLoss: calculatePositionPL(position, pointValue, commission),
        replayIndex,
        replayDay,
        replayWindowDay,
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
    assetClass,
    baseTimeframeMinutes,
    currency,
    pointValue,
    commissionPerSide,
    commissionPercent,
    store,
    replayIndex,
    replayDay,
    replayWindowDay = replayDay,
}: UseTradingSessionOptions) {
    const state = useStore(store);
    const trades = state.trades;
    const commissionSettings = useMemo<CommissionSettings>(
        () => ({
            flatPerSide: commissionPerSide,
            percentPerSide: commissionPercent,
            assetClass,
        }),
        [commissionPerSide, commissionPercent, assetClass],
    );

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
                commissionSettings,
                replayIndex,
                replayDay,
                replayWindowDay,
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
        commissionSettings,
        store,
        recordedIds,
        removedIds,
        markTradesChanged,
        replayIndex,
        replayDay,
        replayWindowDay,
    ]);

    // Rewinding removes completed trades that belong to the part of the
    // replay the user has just left behind. The trade engine reopens the
    // matching positions from its snapshot; the session list must agree.
    const previousReplayRef = useRef<{
        index: number;
        windowDay: string;
    } | null>(null);

    useEffect(() => {
        const previous = previousReplayRef.current;
        previousReplayRef.current = { index: replayIndex, windowDay: replayWindowDay };

        if (previous === null) {
            return;
        }

        // Switching to another replay block (date picker) is not a rewind and
        // must not discard earlier trades.
        if (previous.windowDay !== replayWindowDay) {
            return;
        }

        if (replayIndex >= previous.index) {
            return;
        }

        const staleIds = new Set(
            state.trades
                .filter(
                    (trade) =>
                        (trade.replayWindowDay ?? trade.replayDay) ===
                            replayWindowDay &&
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
        replayWindowDay,
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
            assetClass,
            baseTimeframeMinutes,
            currency,
            pointValue,
            commissionPerSide,
            commissionPercentPerSide: commissionPercent,
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
    }, [
        trades,
        summary,
        instrument,
        assetClass,
        baseTimeframeMinutes,
        currency,
        pointValue,
        commissionPerSide,
        commissionPercent,
        store,
    ]);

    return {
        trades,
        summary,
        hasUnexportedChanges,
        removeTrade,
        exportSession,
    };
}
