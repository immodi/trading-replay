import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";

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
};

/** Build the session record for a position that has a realised exit. */
function toSessionTrade(
    position: Position,
    instrument: string,
    pointValue: number,
    commissionPerSide: number,
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
        commissionPerSide,
        totalCommission: calculateCommission(position.quantity, commissionPerSide),
        grossProfitLoss: calculateGrossProfitLoss(position, pointValue),
        netProfitLoss: calculatePositionPL(position, pointValue, commissionPerSide),
    };
}

/** Filesystem‑safe timestamp for the export file name. */
function fileTimestamp(date: Date): string {
    return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Tracks completed trades for the current session entirely in memory. Nothing
 * is persisted: a refresh or restart starts from an empty session.
 */
export function useTradingSession({
    positions,
    instrument,
    pointValue,
    commissionPerSide,
}: UseTradingSessionOptions) {
    const [trades, setTrades] = useState<SessionTrade[]>([]);
    const [hasUnexportedChanges, setHasUnexportedChanges] = useState(false);

    // Record each completed position exactly once, even if it later disappears
    // from the trade engine (Reset / date change) or the effect re-runs.
    const recordedIdsRef = useRef<Set<string>>(new Set());
    // Trades removed by the user must not be re-recorded while their position
    // is still present in the trade engine.
    const removedIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const unreported = positions.filter(
            (position) =>
                position.state === "close" &&
                position.exitPrice !== undefined &&
                !recordedIdsRef.current.has(position.id) &&
                !removedIdsRef.current.has(position.id),
        );

        if (unreported.length === 0) return;

        const recorded = unreported.map((position) => {
            recordedIdsRef.current.add(position.id);
            return toSessionTrade(position, instrument, pointValue, commissionPerSide);
        });

        setTrades((current) => [...current, ...recorded]);
        setHasUnexportedChanges(true);
    }, [positions, instrument, pointValue, commissionPerSide]);

    const removeTrade = useCallback((id: string) => {
        removedIdsRef.current.add(id);
        setTrades((current) => current.filter((trade) => trade.id !== id));
        setHasUnexportedChanges(true);
    }, []);

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

        setHasUnexportedChanges(false);
    }, [trades, summary, instrument, pointValue, commissionPerSide]);

    // Warn before a refresh / tab close discards a session that was never
    // exported. The browser shows its own generic message.
    useEffect(() => {
        if (!hasUnexportedChanges || trades.length === 0) return;

        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [hasUnexportedChanges, trades.length]);

    return {
        trades,
        summary,
        hasUnexportedChanges,
        removeTrade,
        exportSession,
    };
}
