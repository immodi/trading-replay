import { SESSION_SCHEMA_VERSION } from "@/constants/session";
import type {
    ExportedSessionTrade,
    SessionExport,
    SessionSummary,
    SessionTrade,
} from "@/types/session";

type BuildSessionExportInput = {
    trades: SessionTrade[];
    summary: SessionSummary;
    instrument: string;
    pointValue: number;
    commissionPerSide: number;
    exportedAt?: Date;
};

function toExportedTrade(trade: SessionTrade): ExportedSessionTrade {
    return {
        id: trade.id,
        instrument: trade.instrument,
        direction: trade.direction,
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        entryTime: new Date(trade.entryTime * 1000).toISOString(),
        exitTime: new Date(trade.exitTime * 1000).toISOString(),
        entryTimeUnix: trade.entryTime,
        exitTimeUnix: trade.exitTime,
        totalCommission: trade.totalCommission,
        grossProfitLoss: trade.grossProfitLoss,
        netProfitLoss: trade.netProfitLoss,
    };
}

/** Serialise the in‑memory session into the downloadable export schema. */
export function buildSessionExport({
    trades,
    summary,
    instrument,
    pointValue,
    commissionPerSide,
    exportedAt = new Date(),
}: BuildSessionExportInput): SessionExport {
    return {
        meta: {
            app: "TradeReplay",
            schemaVersion: SESSION_SCHEMA_VERSION,
            exportedAt: exportedAt.toISOString(),
            instrument,
            pointValue,
            commissionPerSide,
        },
        summary,
        trades: trades.map(toExportedTrade),
    };
}
