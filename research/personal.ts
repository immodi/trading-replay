/**
 * Personal-account simulator for a small cash account.
 *
 * Runs a fixed-1-contract strategy on one instrument and walks the actual trade
 * sequence from a $500 starting balance. Reports dollar risk per trade, max
 * drawdown, ruin, and a bootstrap estimate of doubling before ruin.
 *
 * Example:
 *   node --import tsx research/personal.ts --strategy orb-fixed-15m --symbol m2k \
 *     --tf 15 --start 2024-01-01 --end 2026-11-02
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
const symbol = arg("symbol", "m2k");
const timeframe = Number(arg("tf", "15"));
const start = arg("start", "2021-07-12");
const end = arg("end", "2026-11-02");
const startCapital = Number(arg("capital", "500"));
const paramsOverride = process.argv.includes("--params") ? JSON.parse(arg("params")) : {};
const riskDollars = Number(arg("risk", "175"));
const slippageTicks = Number(arg("slippage-ticks", "1"));
const commissionMult = Number(arg("commission-mult", "1"));
const paths = Number(arg("paths", "5000"));
const horizon = Number(arg("horizon", "250"));

const spec = INSTRUMENTS[symbol];
const mod = (await import(
    pathToFileURL(path.resolve(import.meta.dirname, "strategies", `${strategyName}.mjs`)).href
)) as StrategyModule;
const params = { ...paramsOverride, riskDollars };
const bars = barsFor(symbol, timeframe);
const range = rangeBars(bars, start, end, mod.metadata.warmupBars);
const instrument = {
    id: spec.id,
    symbol: spec.symbol,
    pointValue: spec.pointValue,
    commissionPerSide: spec.commissionPerSide * commissionMult,
};

const result = runBacktest({
    bars: range.bars,
    config: {
        instrument,
        startDateUTC: start,
        endDateUTC: end,
        startTs: range.startTs,
        endTsExclusive: range.endTsExclusive,
        timeframeMinutes: timeframe,
        startingCapital: startCapital,
        slippagePointsPerSide: slippageTicks * spec.tickSize,
        maxOpenPositions: 1,
        warmupBars: mod.metadata.warmupBars,
        maxLookbackBars: mod.metadata.maxLookbackBars,
        parameters: params,
    },
    strategy: mod.createStrategy({ params, instrument }),
});

const trades = result.trades;
if (trades.length === 0) {
    console.log(`${strategyName} ${symbol}: no trades`);
    process.exit(0);
}

// Dollar risk at entry (1 contract).
const risks = trades.map((t) => {
    if (t.stopLossPrice === undefined) return 0;
    return Math.abs(t.entryPrice - t.stopLossPrice) * spec.pointValue;
});
const avgRisk = risks.reduce((a, b) => a + b, 0) / risks.length;
const maxRisk = Math.max(...risks);
const minRisk = Math.min(...risks.filter((r) => r > 0));

// Walk the actual sequence.
let equity = startCapital;
let peak = equity;
let maxDd = 0;
let ruined = false;
let maxStreak = 0;
let streak = 0;
let tradeAtRuin = 0;
let tradeAtDouble = 0;
for (let i = 0; i < trades.length; i++) {
    equity += trades[i].netPnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    if (trades[i].netPnl < 0) {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
    } else streak = 0;
    if (!ruined && equity < 100) {
        ruined = true;
        tradeAtRuin = i + 1;
    }
    if (tradeAtDouble === 0 && equity >= startCapital * 2) tradeAtDouble = i + 1;
}

// Bootstrap: resample per-trade dollar PnLs with replacement.
const rng = (() => {
    let seed = 123456789;
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
})();
let doubles = 0;
let ruins = 0;
const finals: number[] = [];
const tradePnl = trades.map((t) => t.netPnl);
for (let p = 0; p < paths; p++) {
    let eq = startCapital;
    let out = 0;
    for (let i = 0; i < horizon; i++) {
        eq += tradePnl[Math.floor(rng() * tradePnl.length)];
        if (eq >= startCapital * 2) {
            out = 1;
            break;
        }
        if (eq < 100) {
            out = -1;
            break;
        }
    }
    if (out === 1) doubles++;
    if (out === -1) ruins++;
    finals.push(eq);
}
finals.sort((a, b) => a - b);
const q = (x: number) => finals[Math.floor(finals.length * x)];

const losses = trades.filter((t) => t.netPnl < 0);
const wins = trades.filter((t) => t.netPnl > 0);
const avgLoss = losses.reduce((a, t) => a + t.netPnl, 0) / Math.max(1, losses.length);
const avgWin = wins.reduce((a, t) => a + t.netPnl, 0) / Math.max(1, wins.length);

console.log(
    [
        `${strategyName} ${symbol} ${timeframe}m ${start}..${end}`,
        `trades=${trades.length} win%=${((100 * wins.length) / trades.length).toFixed(1)} ` +
            `net=$${trades.reduce((a, t) => a + t.netPnl, 0).toFixed(0)} ` +
            `PF=${(wins.reduce((a, t) => a + t.netPnl, 0) / Math.max(1, -losses.reduce((a, t) => a + t.netPnl, 0))).toFixed(2)} ` +
            `avgWin=$${avgWin.toFixed(0)} avgLoss=$${avgLoss.toFixed(0)}`,
        `risk/trade: min=$${minRisk.toFixed(0)} avg=$${avgRisk.toFixed(0)} max=$${maxRisk.toFixed(0)} ` +
            `(${((100 * avgRisk) / startCapital).toFixed(1)}% avg, ${((100 * maxRisk) / startCapital).toFixed(1)}% max of $${startCapital})`,
        `account: final=$${equity.toFixed(0)} maxDD=$${maxDd.toFixed(0)} (${((100 * maxDd) / startCapital).toFixed(0)}%) ` +
            `maxLossStreak=${maxStreak} ruin=${ruined}${ruined ? ` at trade ${tradeAtRuin}` : ""} ` +
            `${tradeAtDouble ? `doubled at trade ${tradeAtDouble}` : "never doubled"}`,
        `bootstrap ${horizon} trades: P(double)=${((100 * doubles) / paths).toFixed(1)}% ` +
            `P(ruin)=${((100 * ruins) / paths).toFixed(1)}% median=$${q(0.5).toFixed(0)} ` +
            `p5=$${q(0.05).toFixed(0)} p95=$${q(0.95).toFixed(0)}; ` +
            `min capital for 5% risk=$${(maxRisk / 0.05).toFixed(0)}`,
    ].join("\n"),
);
