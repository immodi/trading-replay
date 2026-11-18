import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const RESEARCH_DIR = here;
export const REPO_ROOT = path.resolve(here, "..", "..");
export const DATA_DIR = path.join(REPO_ROOT, "data", "egx30");
export const RESULTS_DIR = path.join(here, "results");

export const CONFIG = {
    // Full available EGX30 history for the rolling-window study.
    startDate: "2010-01-01",
    endDate: null as string | null,
    windowYears: 10,
    windowStepYears: 1,

    // Capital and contributions
    initialCapital: 10_000,
    monthlyTopUp: 10_000,
    maxOrderNotional: 1_000_000,
    riskPerTrade: 0.01,
    maxRiskPerTrade: 0.02,
    maxHoldBars: 20,

    // Costs
    costPctPerSide: 0.003,
    fixedFeePerOrder: 0,
    idleCashMonthlyRate: 0.01,

    // Stops
    stopModes: ["atr", "percent"] as Array<"atr" | "percent">,
    atrPeriod: 14,
    atrMultiplier: 2,
    fixedStopPct: 0.075,

    // Personal cash — one third of the previous 10% rate
    personalProfitPct: 1 / 30,
    personalProfitFixed: 0,

    // Strategy parameters
    donchianEntry: 20,
    donchianExit: 10,
    trendSmaPeriod: 50,
    pullbackEmaPeriod: 20,
    emaFast: 10,
    emaSlow: 30,
    bollingerPeriod: 20,
    bollingerStd: 2,
    rsiPeriod: 14,
    rsiEntry: 30,
    rsiExit: 55,
    rsi2Period: 2,
    rsi2Entry: 10,
    rsi2Exit: 50,
    rangeLookback: 20,
    rangeEntryPct: 0.2,
    adxPeriod: 14,
    adxTrendThreshold: 25,
    adxRangeThreshold: 20,

    // Experiment matrix
    runRegimeVariants: true,
    minHistoryBars: 60,

    // Stop/risk tuning (account risk never exceeds maxRiskPerTrade)
    tuningStrategies: ["t1_donchian", "t2_pullback", "t3_ema_cross"],
    tuningRisks: [0.005, 0.01, 0.015, 0.02],
    tuningStops: [
        { key: "atr2", mode: "atr" as const, atrMultiplier: 2, fixedStopPct: 0.075 },
        { key: "atr3", mode: "atr" as const, atrMultiplier: 3, fixedStopPct: 0.075 },
        { key: "atr4", mode: "atr" as const, atrMultiplier: 4, fixedStopPct: 0.075 },
        { key: "fixed5", mode: "percent" as const, atrMultiplier: 2, fixedStopPct: 0.05 },
        { key: "fixed7.5", mode: "percent" as const, atrMultiplier: 2, fixedStopPct: 0.075 },
        { key: "fixed10", mode: "percent" as const, atrMultiplier: 2, fixedStopPct: 0.1 },
    ],

    // Reporting
    topStrategyCount: 12,
    chartTopCount: 6,
};

export type ResearchConfig = typeof CONFIG;
