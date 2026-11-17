/**
 * Aggregate comparison of the candidate families on the development and
 * out-of-sample periods. Prints one CSV row per config/period.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runBacktest } from "../src/backtesting/runBacktest.ts";
import type { BacktestResult, StrategyModule } from "../src/backtesting/types.ts";
import { INSTRUMENTS, barsFor, rangeBars } from "./lib/data.ts";

const DEV = ["2021-07-12", "2023-12-29"] as const;
const OOS = ["2024-01-01", "2026-11-02"] as const;
const SYMBOLS = ["mes", "mnq", "m2k", "mym", "mgc", "mcl"];

interface Config {
    name: string;
    file: string;
    tf: number;
    params: Record<string, unknown>;
    risk: number;
}

const CONFIGS: Config[] = [
    {
        name: "ORB30+width",
        file: "orb-15m",
        tf: 15,
        risk: 175,
        params: { openingRangeBars: 2, rewardRisk: 3, stopAtr: 1.75, trendEma: 0, orWidthMinAtr: 0, orWidthMaxAtr: 2.25 },
    },
    {
        name: "ORB30+width+dailyEMA50",
        file: "orb-trend-15m",
        tf: 15,
        risk: 175,
        params: { openingRangeBars: 2, rewardRisk: 3, stopAtr: 1.75, trendEma: 0, orWidthMinAtr: 0, orWidthMaxAtr: 2.25, dailyEmaDays: 50 },
    },
    {
        name: "ORB30-trailing",
        file: "orb-trail-15m",
        tf: 15,
        risk: 175,
        params: { openingRangeBars: 2, stopAtr: 1.5, trailAtr: 1.5, breakevenR: 1, trendEma: 0 },
    },
    {
        name: "VWAP-reversion",
        file: "vwap-reversion-5m",
        tf: 5,
        risk: 175,
        params: { bandSigma: 2, stopAtr: 1.5, maxTrades: 2 },
    },
    {
        name: "Donchian",
        file: "donchian-15m",
        tf: 15,
        risk: 175,
        params: { entryLookback: 20, exitLookback: 10, stopAtr: 1.5 },
    },
    {
        name: "Open-dip",
        file: "open-dip-15m",
        tf: 15,
        risk: 175,
        params: { dipMin: 0.25, dipMax: 1.2, bothSides: true, stopAtr: 2, targetR: 0 },
    },
];

const cache = new Map<string, ReturnType<typeof barsFor>>();
function getBars(symbol: string, tf: number) {
    const key = `${symbol}-${tf}`;
    if (!cache.has(key)) cache.set(key, barsFor(symbol, tf));
    return cache.get(key)!;
}

function summarize(result: BacktestResult) {
    const trades = result.trades;
    const net = trades.reduce((a, t) => a + t.netPnl, 0);
    const wins = trades.filter((t) => t.netPnl > 0).length;
    const winPnL = trades.reduce((a, t) => a + Math.max(0, t.netPnl), 0);
    const lossPnL = Math.abs(trades.reduce((a, t) => a + Math.min(0, t.netPnl), 0));
    return {
        trades: trades.length,
        net,
        pf: lossPnL > 0 ? winPnL / lossPnL : null,
        winPct: trades.length ? (100 * wins) / trades.length : 0,
    };
}

console.log("config,period,symbol,trades,net,pf,winPct");
for (const cfg of CONFIGS) {
    const modulePath = path.resolve(import.meta.dirname, "strategies", `${cfg.file}.mjs`);
    const mod = (await import(pathToFileURL(modulePath).href)) as StrategyModule;
    const params = { ...cfg.params, riskDollars: cfg.risk };

    for (const [period, [start, end]] of [
        ["dev", DEV],
        ["oos", OOS],
    ] as const) {
        let totalNet = 0;
        let totalTrades = 0;
        let totalWins = 0;
        let totalWinPnL = 0;
        let totalLossPnL = 0;
        for (const symbol of SYMBOLS) {
            const spec = INSTRUMENTS[symbol];
            const allBars = getBars(symbol, cfg.tf);
            const range = rangeBars(allBars, start, end, mod.metadata.warmupBars);
            const instrument = {
                id: spec.id,
                symbol: spec.symbol,
                pointValue: spec.pointValue,
                commissionPerSide: spec.commissionPerSide,
            };
            const result = runBacktest({
                bars: range.bars,
                config: {
                    instrument,
                    startDateUTC: start,
                    endDateUTC: end,
                    startTs: range.startTs,
                    endTsExclusive: range.endTsExclusive,
                    timeframeMinutes: cfg.tf,
                    startingCapital: 50_000,
                    slippagePointsPerSide: spec.tickSize,
                    maxOpenPositions: 1,
                    warmupBars: mod.metadata.warmupBars,
                    maxLookbackBars: mod.metadata.maxLookbackBars,
                    parameters: params,
                },
                strategy: mod.createStrategy({ params, instrument }),
            });
            const s = summarize(result);
            totalNet += s.net;
            totalTrades += s.trades;
            totalWins += result.trades.filter((t) => t.netPnl > 0).length;
            totalWinPnL += result.trades.reduce((a, t) => a + Math.max(0, t.netPnl), 0);
            totalLossPnL += Math.abs(result.trades.reduce((a, t) => a + Math.min(0, t.netPnl), 0));
            console.log(
                `${cfg.name},${period},${symbol},${s.trades},${s.net.toFixed(0)},${s.pf?.toFixed(2) ?? ""},${s.winPct.toFixed(1)}`,
            );
        }
        console.log(
            `${cfg.name},${period},ALL,${totalTrades},${totalNet.toFixed(0)},${(totalWinPnL / Math.max(1, totalLossPnL)).toFixed(2)},${((100 * totalWins) / Math.max(1, totalTrades)).toFixed(1)}`,
        );
    }
}
