import { SESSION_SCHEMA_VERSION } from "@/constants/session";
import type { AssetClass } from "@/constants/assetClass";
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
    assetClass?: AssetClass;
    baseTimeframeMinutes?: number;
    currency?: string;
    pointValue: number;
    commissionPerSide: number;
    commissionPercentPerSide: number;
    exportedAt?: Date;
};

function toExportedTrade(
    trade: SessionTrade,
    currency: string,
): ExportedSessionTrade {
    return {
        id: trade.id,
        instrument: trade.instrument,
        currency,
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
    assetClass,
    baseTimeframeMinutes,
    currency,
    pointValue,
    commissionPerSide,
    commissionPercentPerSide,
    exportedAt = new Date(),
}: BuildSessionExportInput): SessionExport {
    return {
        meta: {
            app: "TradeReplay",
            schemaVersion: SESSION_SCHEMA_VERSION,
            exportedAt: exportedAt.toISOString(),
            instrument,
            ...(assetClass === undefined ? {} : { assetClass }),
            ...(baseTimeframeMinutes === undefined
                ? {}
                : { baseTimeframeMinutes }),
            ...(currency === undefined ? {} : { currency }),
            pointValue,
            commissionPerSide,
            commissionPercentPerSide,
        },
        summary,
        trades: trades.map((trade) =>
            toExportedTrade(trade, currency ?? "USD"),
        ),
    };
}
