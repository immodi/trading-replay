/**
 * Parameter sweep for one instrument. Bars are loaded/aggregated once and the
 * engine is re-run for each parameter combination.
 *
 * Usage:
 *   node --import tsx research/sweep.ts --strategy orb-15m --symbol mes --tf 15 \
 *     --start 2021-07-12 --end 2023-12-29 --grid '{"rewardRisk":[1,1.5,2,3]}'
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
const grid = JSON.parse(arg("grid", "{}"));

const spec = INSTRUMENTS[symbol];
const modulePath = path.resolve(import.meta.dirname, "strategies", `${strategyName}.mjs`);
const mod = (await import(pathToFileURL(modulePath).href)) as StrategyModule;
const bars = barsFor(symbol, timeframe);
const range = rangeBars(bars, start, end, mod.metadata.warmupBars);
const instrument = {
    id: spec.id,
    symbol: spec.symbol,
    pointValue: spec.pointValue,
    commissionPerSide: spec.commissionPerSide,
};

const keys = Object.keys(grid);
const combos = [{}];
for (const key of keys) {
    const values = grid[key];
    const next = [];
    for (const combo of combos) for (const value of values) next.push({ ...combo, [key]: value });
    combos.length = 0;
    combos.push(...next);
}

console.log("symbol,tf,params,trades,winPct,net,pf,expectancy,maxDD,tradesPerDay,avgWin,avgLoss,pnl2021,pnl2022,pnl2023");
for (const combo of combos) {
    const params = { ...combo, riskDollars: risk };
    const result = runBacktest({
        bars: range.bars,
        config: {
            instrument,
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
        strategy: mod.createStrategy({ params, instrument }),
    });
    const s = result.summary;
    const year = { 2021: 0, 2022: 0, 2023: 0 };
    const days = new Set();
    for (const t of result.trades) {
        const y = t.entryTimeISO.slice(0, 4);
        if (y in year) year[y] += t.netPnl;
        days.add(t.entryTimeISO.slice(0, 10));
    }
    const label = JSON.stringify(combo).replaceAll(",", ";");
    console.log(
        [
            symbol,
            timeframe,
            label,
            s.closedTrades,
            s.winRatePct?.toFixed(1) ?? "",
            s.netPnl.toFixed(0),
            s.profitFactor?.toFixed(2) ?? "",
            s.expectancyPerTrade?.toFixed(2) ?? "",
            s.maxDrawdown.toFixed(0),
            (s.closedTrades / Math.max(1, days.size)).toFixed(2),
            s.averageWin?.toFixed(0) ?? "",
            s.averageLoss?.toFixed(0) ?? "",
            year[2021].toFixed(0),
            year[2022].toFixed(0),
            year[2023].toFixed(0),
        ].join(","),
    );
}
