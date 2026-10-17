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

    /** Instrument commission in dollars per contract, per side. */
    commissionPerSide: number;
    /** `commissionPerSide * 2 * quantity`. */
    totalCommission: number;
    /** Realised P/L before commission, in dollars. */
    grossProfitLoss: number;
    /** Realised P/L after commission, in dollars. */
    netProfitLoss: number;
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
    commissionPerSide: number;
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
        pointValue: number;
        commissionPerSide: number;
    };
    summary: SessionSummary;
    trades: ExportedSessionTrade[];
};
