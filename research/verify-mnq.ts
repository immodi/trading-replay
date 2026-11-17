/** Verify the MNQ preset matches the research module at $400 risk. */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runBacktest } from "../src/backtesting/runBacktest.ts";
import type { StrategyModule } from "../src/backtesting/types.ts";
import { INSTRUMENTS, barsFor, rangeBars } from "./lib/data.ts";
import { validateMetadata, validateParameterValues } from "../src/backtesting/validateStrategy.ts";

const spec = INSTRUMENTS.mnq;
const instrument = {
    id: "mnq",
    symbol: "MNQ",
    pointValue: spec.pointValue,
    commissionPerSide: spec.commissionPerSide,
};
const deploy = (await import(
    pathToFileURL(path.resolve(import.meta.dirname, "deployable", "mnq-orb-15m.js")).href
)) as StrategyModule;
const research = (await import(
    pathToFileURL(path.resolve(import.meta.dirname, "strategies", "orb-15m.mjs")).href
)) as StrategyModule;
const meta = validateMetadata(deploy.metadata);
const defaults = validateParameterValues(meta, {});
console.log(`metadata valid: ${meta.id}; risk default=$${defaults.riskDollars}`);
const bars = barsFor("mnq", 15);
const range = rangeBars(bars, "2021-07-12", "2026-11-02", 4000);
const base = {
    stopAtr: 1.75,
    rewardRisk: 3,
    maxOrWidthAtr: 2.25,
    riskDollars: 400,
    maxContracts: 10,
};
const deployParams = { ...base };
const researchParams = {
    openingRangeBars: 2,
    rewardRisk: 3,
    stopAtr: 1.75,
    trendEma: 0,
    orWidthMinAtr: 0,
    orWidthMaxAtr: 2.25,
    riskDollars: 400,
    maxContracts: 10,
};

function run(mod: StrategyModule, params: Record<string, unknown>) {
    return runBacktest({
        bars: range.bars,
        config: {
            instrument,
            startDateUTC: "2021-07-12",
            endDateUTC: "2026-11-02",
            startTs: range.startTs,
            endTsExclusive: range.endTsExclusive,
            timeframeMinutes: 15,
            startingCapital: 50_000,
            slippagePointsPerSide: spec.tickSize,
            maxOpenPositions: 1,
            warmupBars: 4000,
            maxLookbackBars: mod.metadata.maxLookbackBars,
            parameters: params,
        },
        strategy: mod.createStrategy({ params, instrument }),
    });
}

const a = run(deploy, deployParams);
const b = run(research, researchParams);
const fmt = (t: (typeof a.trades)[number]) =>
    `${t.entryTime}|${t.side}|${t.quantity}|${t.entryPrice}|${t.exitPrice}|${t.exitReason}`;
const same =
    a.trades.length === b.trades.length &&
    a.trades.every((t, i) => fmt(t) === fmt(b.trades[i]));
console.log(
    `MNQ preset trades=${a.trades.length} net=$${a.summary.netPnl.toFixed(0)} | ` +
        `research trades=${b.trades.length} net=$${b.summary.netPnl.toFixed(0)} | identical=${same}`,
);
if (!same) process.exitCode = 1;
