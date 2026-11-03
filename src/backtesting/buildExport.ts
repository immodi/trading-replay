import { downloadJson } from "@/utils/downloadJson";
import { MAX_CONTRACTS_PER_ENTRY } from "./constants";
import type {
    BacktestExport,
    BacktestResult,
    BacktestRunConfig,
    InstrumentContext,
    StrategyMetadata,
} from "./types";

export interface BuildBacktestExportInput {
    result: BacktestResult;
    metadata: StrategyMetadata;
    fileName: string;
    source: string;
    parameters: Record<string, unknown>;
    instrument: InstrumentContext;
    config: BacktestRunConfig;
}

function safeFileNamePart(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export function buildBacktestExport({
    result,
    metadata,
    fileName,
    source,
    parameters,
    instrument,
    config,
}: BuildBacktestExportInput): BacktestExport {
    return {
        schemaVersion: 1,
        application: "TradeReplay",
        exportedAt: new Date().toISOString(),
        strategy: {
            id: metadata.id,
            name: metadata.name,
            version: metadata.version,
            apiVersion: 1,
            fileName,
            source,
            parameters: { ...parameters },
        },
        instrument: { ...instrument },
        settings: {
            startDateUTC: config.startDateUTC,
            endDateUTC: config.endDateUTC,
            timeframeMinutes: config.timeframeMinutes,
            startingCapital: config.startingCapital,
            slippagePointsPerSide: config.slippagePointsPerSide,
            maxOpenPositions: config.maxOpenPositions,
            maxContractsPerEntry: MAX_CONTRACTS_PER_ENTRY,
            warmupBars: config.warmupBars,
            forcedCloseAtEnd: true,
            executionAssumptions: result.assumptions,
        },
        dataQuality: result.dataQuality,
        summary: result.summary,
        equityCurve: result.equityCurve,
        trades: result.trades,
    };
}

function sanitizeJson(value: unknown): unknown {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (Array.isArray(value)) {
        return value.map(sanitizeJson);
    }

    if (typeof value === "object" && value !== null) {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                sanitizeJson(entry),
            ]),
        );
    }

    return value;
}

export function downloadBacktestExport(input: BuildBacktestExportInput): void {
    const data = buildBacktestExport(input);
    const fileName = [
        "tradereplay-backtest",
        safeFileNamePart(data.strategy.id),
        data.settings.startDateUTC,
        data.settings.endDateUTC,
    ].join("_");

    downloadJson(`${fileName}.json`, sanitizeJson(data));
}
