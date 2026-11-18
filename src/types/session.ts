import type { AssetClass } from "@/constants/assetClass";
import type { UTCTimestamp } from "lightweight-charts";
import type { Direction } from "@/types/position";

/** A completed trade recorded for the active (in‑memory) trading session. */
export type SessionTrade = {
    id: string;
    instrument: string;
    direction: Direction;
    quantity: number;

    entryPrice: number;
    exitPrice: number;
    entryTime: UTCTimestamp;
    exitTime: UTCTimestamp;

    /** Commission for the completed round trip, in the source currency. */
    totalCommission: number;
    /** Realised P/L before commission, in the source currency. */
    grossProfitLoss: number;
    /** Realised P/L after commission, in the source currency. */
    netProfitLoss: number;

    /**
     * Replay tick at which the trade was recorded. Used to drop trades that
     * belong to a future the user has rewound past. Optional for sessions
     * written by older versions.
     */
    replayIndex?: number;
    /** UTC day of the replay tick (YYYY-MM-DD). */
    replayDay?: string;
    /**
     * UTC day that anchored the replay block when the trade was recorded.
     * Distinguishes trades from different date selections that happen to
     * share the same replay index.
     */
    replayWindowDay?: string;
};

export type SessionSummary = {
    tradeCount: number;
    totalNetProfitLoss: number;
    totalCommission: number;
};

/** A trade as serialised into the exported JSON document. */
export type ExportedSessionTrade = {
    id: string;
    instrument: string;
    /** Reporting currency for this trade's P/L values. */
    currency: string;
    direction: Direction;
    quantity: number;
    entryPrice: number;
    exitPrice: number;
    /** ISO 8601 timestamp in UTC. */
    entryTime: string;
    /** ISO 8601 timestamp in UTC. */
    exitTime: string;
    /** Raw Unix timestamp in seconds, for analysis. */
    entryTimeUnix: number;
    /** Raw Unix timestamp in seconds, for analysis. */
    exitTimeUnix: number;
    totalCommission: number;
    grossProfitLoss: number;
    netProfitLoss: number;
};

/** The downloadable JSON snapshot of a trading session. */
export type SessionExport = {
    meta: {
        app: "TradeReplay";
        schemaVersion: number;
        exportedAt: string;
        instrument: string;
        assetClass?: AssetClass;
        baseTimeframeMinutes?: number;
        currency?: string;
        pointValue: number;
        commissionPerSide: number;
        commissionPercentPerSide: number;
    };
    summary: SessionSummary;
    trades: ExportedSessionTrade[];
};
