/**
 * Risk-overlay experiment: switch between two position-size paths (aggressive
 * and defensive) at day boundaries based on the eval's own drawdown/profit.
 *
 * Example:
 *   node --import tsx research/portfolio-switch.ts \
 *     --dirA research/results/mnq-r500 --dirB research/results/mnq-r250 \
 *     --symbol mnq --dd-switch 400 --profit-switch 1500
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROP } from "./lib/prop.ts";
import type { Day } from "./lib/prop.ts";

function arg(name: string, fallback?: string): string {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx >= 0 && process.argv[idx + 1] !== undefined) return process.argv[idx + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing --${name}`);
}

const dirA = arg("dirA", "research/results/mnq-r500");
const dirB = arg("dirB", "research/results/mnq-r250");
const symbol = arg("symbol", "mnq");
const ddSwitch = Number(arg("dd-switch", "400"));
const profitSwitch = Number(arg("profit-switch", "1500"));
const riskA = Number(arg("riskA", "500"));
const riskB = Number(arg("riskB", "250"));
const horizon = Number(arg("horizon", "60"));
const target = Number(arg("target", "3000"));
const maxDd = Number(arg("dd", "2000"));
const trailMode = arg("trail", "intraday") as "intraday" | "eod" | "static";

const a = (JSON.parse(fs.readFileSync(path.join(dirA, `${symbol}.json`), "utf8")) as { days: Day[] }).days;
const b = (JSON.parse(fs.readFileSync(path.join(dirB, `${symbol}.json`), "utf8")) as { days: Day[] }).days;
const bByDate = new Map(b.map((d) => [d.date, d]));

interface Out {
    passed: boolean;
    days: number | null;
    ddUsed: number;
    fail: string;
}

function simulate(start: number): Out {
    const capital = DEFAULT_PROP.startingBalance;
    let equity = capital;
    let peak = capital;
    let minEquity = capital;
    let bestDay = 0;
    let elapsed = 0;

    for (let d = start; d < a.length; d++) {
        const dayA = a[d];
        const ddFromPeak = peak - equity;
        const profit = equity - capital;
        const useB = ddFromPeak > ddSwitch || profit >= profitSwitch;
        const day = (useB ? bByDate.get(dayA.date) : dayA) ?? dayA;
        const dayStart = equity;
        let dayBest = 0;

        for (const bar of day.bars) {
            const eqBest = dayStart + bar.dBest;
            const eqWorst = dayStart + bar.dWorst;
            const eqClose = dayStart + bar.dClose;

            if (trailMode === "intraday" && eqBest > peak) peak = eqBest;
            if (eqWorst < minEquity) minEquity = eqWorst;

            let floor = trailMode === "static" ? capital - maxDd : peak - maxDd;
            if (floor > capital) floor = capital;

            if (eqWorst < floor) {
                return { passed: false, days: null, ddUsed: peak - minEquity, fail: "drawdown" };
            }
            if (cfgDailyLoss !== null && eqWorst - dayStart <= -cfgDailyLoss) {
                return { passed: false, days: null, ddUsed: peak - minEquity, fail: "daily_loss" };
            }
            if (eqBest >= capital + target) {
                return { passed: true, days: elapsed + 1, ddUsed: peak - minEquity, fail: "" };
            }
            if (eqClose - dayStart > dayBest) dayBest = eqClose - dayStart;
            if (trailMode === "eod" && eqClose > peak) peak = eqClose;
        }

        elapsed += 1;
        equity = dayStart + day.dEnd;
        const profitDay = equity - dayStart;
        if (profitDay > bestDay) bestDay = profitDay;
        else if (dayBest > bestDay) bestDay = dayBest;
        if (trailMode === "eod" && equity > peak) peak = equity;

        if (elapsed >= horizon) {
            return { passed: false, days: null, ddUsed: peak - minEquity, fail: "time" };
        }
    }
    return { passed: false, days: null, ddUsed: peak - minEquity, fail: "time" };
}

const cfgDailyLoss = process.argv.includes("--daily-loss") ? Number(arg("daily-loss")) : null;

const outcomes = a.map((_, i) => simulate(i));
const passes = outcomes.filter((o) => o.passed);
const p = (h: number) => {
    const eligible = outcomes.filter((_, i) => a.length - i >= h);
    return eligible.filter((o) => o.passed && (o.days ?? 999) <= h).length / eligible.length;
};
const p60 = passes.length / outcomes.length;
const avgDd = outcomes.reduce((x, o) => x + o.ddUsed, 0) / outcomes.length;
const q = (v: number[], x: number) => [...v].sort((m, n) => m - n)[Math.floor(v.length * x)];

console.log(
    `A=${riskA} B=${riskB} ddSwitch=${ddSwitch} profitSwitch=${profitSwitch} ` +
        `pass=${(100 * p60).toFixed(1)}% p20=${(100 * p(20)).toFixed(0)}% p30=${(100 * p(30)).toFixed(0)}% ` +
        `p45=${(100 * p(45)).toFixed(0)}% p60=${(100 * p(60)).toFixed(0)}% ` +
        `medianDays=${q(passes.map((o) => o.days ?? 0), 0.5)} avgDDused=$${avgDd.toFixed(0)} ` +
        `fails=${outcomes.filter((o) => !o.passed).length}`,
);
