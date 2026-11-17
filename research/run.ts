/**
 * Run one strategy/instrument/date range through the app's engine and print
 * the summary. Used for smoke tests; evaluate.ts does the prop simulation.
 *
 * Usage:
 *   node --import tsx research/run.ts --strategy orb-15m --symbol mes \
 *        --tf 15 --start 2021-07-12 --end 2023-12-29 --risk 100
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runBacktest } from "../src/backtesting/runBacktest.ts";
import type { StrategyModule } from "../src/backtesting/types.ts";
import { INSTRUMENTS, barsFor, rangeBars } from "./lib/data.ts";

function arg(name: string, fallback?: string): string {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx >= 0 && process.argv[idx + 1] !== undefined) return process.argv[idx + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing --${name}`);
}

const strategyName = arg("strategy");
const symbol = arg("symbol", "mes");
const timeframe = Number(arg("tf", "15"));
const start = arg("start", "2021-07-12");
const end = arg("end", "2023-12-29");
const risk = Number(arg("risk", "100"));
const slippageTicks = Number(arg("slippage-ticks", "1"));
const commissionMult = Number(arg("commission-mult", "1"));
const commissionOverride = process.argv.includes("--commission")
    ? Number(arg("commission"))
    : undefined;
const paramsOverride = process.argv.includes("--params")
    ? JSON.parse(arg("params"))
    : {};

const spec = INSTRUMENTS[symbol];
if (!spec) throw new Error(`Unknown symbol ${symbol}`);

const modulePath = path.resolve(import.meta.dirname, "strategies", `${strategyName}.mjs`);
const mod = (await import(pathToFileURL(modulePath).href)) as StrategyModule;

const params = { ...paramsOverride, riskDollars: risk };
const bars = barsFor(symbol, timeframe);
const range = rangeBars(bars, start, end, mod.metadata.warmupBars);

const result = runBacktest({
    bars: range.bars,
    config: {
        instrument: {
            id: spec.id,
            symbol: spec.symbol,
            pointValue: spec.pointValue,
            commissionPerSide: (commissionOverride ?? spec.commissionPerSide) * commissionMult,
        },
        startDateUTC: start,
        endDateUTC: end,
        startTs: range.startTs,
        endTsExclusive: range.endTsExclusive,
        timeframeMinutes: timeframe,
        startingCapital: 50_000,
        slippagePointsPerSide: slippageTicks * spec.tickSize,
        maxOpenPositions: 1,
        warmupBars: mod.metadata.warmupBars,
        maxLookbackBars: mod.metadata.maxLookbackBars,
        parameters: params,
    },
    strategy: mod.createStrategy({
        params,
        instrument: {
            id: spec.id,
            symbol: spec.symbol,
            pointValue: spec.pointValue,
            commissionPerSide: (commissionOverride ?? spec.commissionPerSide) * commissionMult,
        },
    }),
});

const s = result.summary;
console.log(
    `${strategyName} ${symbol} ${timeframe}m ${start}..${end}\n` +
        `trades=${s.closedTrades} win%=${s.winRatePct?.toFixed(1)} net=$${s.netPnl.toFixed(0)} ` +
        `PF=${s.profitFactor?.toFixed(2)} avgWin=$${s.averageWin?.toFixed(0)} avgLoss=$${s.averageLoss?.toFixed(0)} ` +
        `expectancy=$${s.expectancyPerTrade?.toFixed(2)} maxDD=$${s.maxDrawdown.toFixed(0)} ` +
        `rejected=${JSON.stringify(s.rejectedActions)}`,
);
const byYear = new Map<string, { n: number; pnl: number; wins: number }>();
for (const t of result.trades) {
    const y = t.entryTimeISO.slice(0, 4);
    const row = byYear.get(y) ?? { n: 0, pnl: 0, wins: 0 };
    row.n++;
    row.pnl += t.netPnl;
    if (t.netPnl > 0) row.wins++;
    byYear.set(y, row);
}
for (const [y, row] of [...byYear].sort()) {
    console.log(
        `  ${y}: n=${row.n} pnl=$${row.pnl.toFixed(0)} win%=${((row.wins / row.n) * 100).toFixed(1)}`,
    );
}
const overnight = result.trades.filter(
    (t) => t.entryTimeISO.slice(0, 10) !== t.exitTimeISO.slice(0, 10),
);
console.log(`overnight trades: ${overnight.length}`);
