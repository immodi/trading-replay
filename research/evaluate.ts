/**
 * Run a strategy on one or all instruments and simulate a prop evaluation from
 * every trading day.
 *
 * Usage:
 *   node --import tsx research/evaluate.ts --strategy orb-15m --symbol all \
 *     --tf 15 --start 2021-07-12 --end 2023-12-29 --risk 150 --trail intraday
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { runBacktest } from "../src/backtesting/runBacktest.ts";
import type { BarEquityPoint, StrategyModule } from "../src/backtesting/types.ts";
import { INSTRUMENTS, barsFor, rangeBars } from "./lib/data.ts";
import { DEFAULT_PROP, buildDays, buildEquityBars, simulateEval, summarizeEvals } from "./lib/prop.ts";
import type { PropConfig } from "./lib/prop.ts";
import { isRth } from "./lib/session.ts";

function arg(name: string, fallback?: string): string {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx >= 0 && process.argv[idx + 1] !== undefined) return process.argv[idx + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing --${name}`);
}

const strategyName = arg("strategy");
const symbolArg = arg("symbol", "all");
const timeframe = Number(arg("tf", "15"));
const start = arg("start", "2021-07-12");
const end = arg("end", "2023-12-29");
const risk = Number(arg("risk", "150"));
const paramsOverride = process.argv.includes("--params") ? JSON.parse(arg("params")) : {};
const slippageTicks = Number(arg("slippage-ticks", "1"));
const commissionMult = Number(arg("commission-mult", "1"));
const trailMode = arg("trail", "intraday") as PropConfig["trailMode"];
const maxDd = Number(arg("dd", "2000"));
const target = Number(arg("target", "3000"));
const lockFloor = arg("lock", "true") !== "false";
const dailyLoss = process.argv.includes("--daily-loss") ? Number(arg("daily-loss")) : null;
const consistency = process.argv.includes("--consistency") ? Number(arg("consistency")) : null;
const horizon = Number(arg("horizon", "60"));
const outFile = process.argv.includes("--out") ? arg("out") : null;
const saveDir = process.argv.includes("--save") ? arg("save") : null;

const prop: PropConfig = {
    ...DEFAULT_PROP,
    maxTrailingDrawdown: maxDd,
    profitTarget: target,
    trailMode,
    lockFloorAtStart: lockFloor,
    dailyLossLimit: dailyLoss,
    consistencyMaxBestDayPct: consistency,
    timeLimitDays: horizon,
};

const modulePath = path.resolve(import.meta.dirname, "strategies", `${strategyName}.mjs`);
const mod = (await import(pathToFileURL(modulePath).href)) as StrategyModule;
const symbols = symbolArg === "all" ? Object.keys(INSTRUMENTS) : symbolArg.split(",");

const report: Record<string, unknown> = {};

for (const symbol of symbols) {
    const spec = INSTRUMENTS[symbol];
    if (!spec) throw new Error(`Unknown symbol ${symbol}`);
    const params = { ...paramsOverride, riskDollars: risk };
    const bars = barsFor(symbol, timeframe);
    const range = rangeBars(bars, start, end, mod.metadata.warmupBars);
    const instrument = {
        id: spec.id,
        symbol: spec.symbol,
        pointValue: spec.pointValue,
        commissionPerSide: spec.commissionPerSide * commissionMult,
    };

    const points: BarEquityPoint[] = [];
    const result = runBacktest({
        bars: range.bars,
        config: {
            instrument,
            startDateUTC: start,
            endDateUTC: end,
            startTs: range.startTs,
            endTsExclusive: range.endTsExclusive,
            timeframeMinutes: timeframe,
            startingCapital: prop.startingBalance,
            slippagePointsPerSide: slippageTicks * spec.tickSize,
            maxOpenPositions: 1,
            warmupBars: mod.metadata.warmupBars,
            maxLookbackBars: mod.metadata.maxLookbackBars,
            parameters: params,
        },
        strategy: mod.createStrategy({ params, instrument }),
        onBarEquity: (p) => {
            if (isRth(p.time)) points.push(p);
        },
    });

    const equityBars = buildEquityBars(points, result.trades, spec.pointValue, prop.startingBalance);
    const days = buildDays(equityBars, prop.startingBalance);
    const dayIndex = new Map(days.map((d, i) => [d.date, i]));
    const outcomes = days.map((_, i) => simulateEval(days, i, prop));
    const summary = summarizeEvals(outcomes, (startDate, h) => {
        const i = dayIndex.get(startDate) ?? 0;
        return days.length - i >= h;
    });

    const s = result.summary;
    const overnight = result.trades.filter((t) => t.entryTimeISO.slice(0, 10) !== t.exitTimeISO.slice(0, 10)).length;
    report[symbol] = {
        strategyStats: {
            trades: s.closedTrades,
            netPnl: s.netPnl,
            profitFactor: s.profitFactor,
            winRatePct: s.winRatePct,
            expectancy: s.expectancyPerTrade,
            engineMaxDd: s.maxDrawdown,
            overnightTrades: overnight,
            avgWin: s.averageWin,
            avgLoss: s.averageLoss,
        },
        eval: summary,
        outcomes: outcomes.map((o) => ({
            start: o.startDate,
            passed: o.passed,
            fail: o.failReason,
            days: o.daysToPass,
            maxDd: Math.round(o.maxDrawdownUsed),
        })),
    };

    console.log(
        `${symbol.padEnd(4)} trades=${String(s.closedTrades).padStart(4)} net=$${s.netPnl.toFixed(0).padStart(6)} ` +
            `PF=${(s.profitFactor ?? 0).toFixed(2)} DD=$${s.maxDrawdown.toFixed(0).padStart(5)} | ` +
            `pass=${(summary.passRate * 100).toFixed(1)}% p20=${(summary.pPass20 * 100).toFixed(0)}% ` +
            `p30=${(summary.pPass30 * 100).toFixed(0)}% p45=${(summary.pPass45 * 100).toFixed(0)}% ` +
            `p60=${(summary.pPass60 * 100).toFixed(0)}% medDays=${summary.medianDaysToPass ?? "-"} ` +
            `fails=${JSON.stringify(summary.failByReason)}`,
    );

    if (saveDir) {
        fs.mkdirSync(saveDir, { recursive: true });
        fs.writeFileSync(path.join(saveDir, `${symbol}.json`), JSON.stringify({ days, trades: result.trades }));
    }
}

if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify({ prop, risk, strategy: strategyName, report }, null, 2));
    console.log(`wrote ${outFile}`);
}
