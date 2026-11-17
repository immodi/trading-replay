/**
 * Combine independently-run instrument equity paths into one account and run
 * the same rolling-start prop simulation on the aggregate.
 *
 * The per-instrument files come from:
 *   evaluate.ts ... --save research/results/<tag>
 *
 * At each timestamp the aggregate marks open risk as the sum of each
 * instrument's worst/best excursion (a conservative simultaneity assumption).
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROP, simulateEval, summarizeEvals } from "./lib/prop.ts";
import { DEFAULT_FUNDED, simulateFunded, summarizeFunded } from "./lib/funded.ts";
import type { FundedConfig } from "./lib/funded.ts";
import type { Day, PropConfig } from "./lib/prop.ts";

function arg(name: string, fallback?: string): string {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx >= 0 && process.argv[idx + 1] !== undefined) return process.argv[idx + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing --${name}`);
}

const dir = arg("dir");
const symbols = arg("symbols", "mes,mnq,m2k,mym,mgc,mcl").split(",");
const trailMode = arg("trail", "intraday") as PropConfig["trailMode"];
const maxDd = Number(arg("dd", "2000"));
const target = Number(arg("target", "3000"));
const horizon = Number(arg("horizon", "60"));
const lock = arg("lock", "true") !== "false";
const dailyLoss = process.argv.includes("--daily-loss") ? Number(arg("daily-loss")) : null;
const markMode = arg("mark", "extreme");

const files = symbols.map((s) => JSON.parse(fs.readFileSync(path.join(dir, `${s}.json`), "utf8")) as { days: Day[] });

const byDate = new Map<string, Map<string, { dClose: number; dWorst: number; dBest: number }>>();
const endByDate = new Map<string, number>();

for (const file of files) {
    for (const day of file.days) {
        const m = byDate.get(day.date) ?? new Map();
        byDate.set(day.date, m);
        let last = { dClose: 0, dWorst: 0, dBest: 0 };
        for (const bar of day.bars) {
            const key = String(bar.time);
            last = { dClose: bar.dClose, dWorst: bar.dWorst, dBest: bar.dBest };
            m.set(key, last);
        }
        endByDate.set(day.date, (endByDate.get(day.date) ?? 0) + (day.dEnd || 0));
    }
}

const dates = [...byDate.keys()].sort();
const allTimes = [...new Set(files.flatMap((f) => f.days.flatMap((d) => d.bars.map((b) => b.time))))].sort();
const timeIndex = new Map(allTimes.map((t, i) => [t, i]));

const combined: Day[] = [];
const lastBySymbol = new Map<string, { dClose: number; dWorst: number; dBest: number }>();
const dayLastBySymbol = new Map<string, { dClose: number; dWorst: number; dBest: number }>();

for (const date of dates) {
    const instrumentTimes = files.map((f) => {
        const day = f.days.find((d) => d.date === date);
        return day ? new Map(day.bars.map((b) => [b.time, b])) : new Map();
    });

    const times = [...new Set(files.flatMap((f) => f.days.find((d) => d.date === date)?.bars.map((b) => b.time) ?? []))].sort(
        (a, b) => a - b,
    );
    const bars = [];
    for (const time of times) {
        let dClose = 0;
        let dWorst = 0;
        let dBest = 0;
        for (let i = 0; i < files.length; i++) {
            const bar = instrumentTimes[i].get(time);
            if (bar) {
                dayLastBySymbol.set(symbols[i], bar);
                dClose += bar.dClose;
                dWorst += bar.dWorst;
                dBest += bar.dBest;
            } else {
                const last = dayLastBySymbol.get(symbols[i]);
                if (last) {
                    dClose += last.dClose;
                    dWorst += last.dWorst;
                    dBest += last.dBest;
                }
            }
        }
        bars.push({ time, date, dClose, dWorst, dBest });
    }
    if (bars.length === 0) continue;
    if (markMode === "close") {
        for (const bar of bars) {
            bar.dWorst = bar.dClose;
            bar.dBest = bar.dClose;
        }
    }
    const dEnd = endByDate.get(date) ?? bars[bars.length - 1].dClose;
    combined.push({ date, bars, dEnd });
}

const prop: PropConfig = {
    ...DEFAULT_PROP,
    trailMode,
    maxTrailingDrawdown: maxDd,
    profitTarget: target,
    timeLimitDays: horizon,
    lockFloorAtStart: lock,
    dailyLossLimit: dailyLoss,
};

const outcomes = combined.map((_, i) => simulateEval(combined, i, prop));
const dayIndex = new Map(combined.map((d, i) => [d.date, i]));
const summary = summarizeEvals(outcomes, (startDate, h) => {
    const i = dayIndex.get(startDate) ?? 0;
    return combined.length - i >= h;
});

const passDays = outcomes.filter((o) => o.passed).map((o) => o.daysToPass ?? 0).sort((a, b) => a - b);
const median = passDays.length ? passDays[Math.floor(passDays.length / 2)] : null;
const dailyPnl = combined.map((d) => d.dEnd);
const mean = dailyPnl.reduce((a, b) => a + b, 0) / dailyPnl.length;
const sd = Math.sqrt(dailyPnl.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyPnl.length);

console.log(
    `PORTFOLIO ${symbols.join("+")} risk=${dir}\n` +
        `days=${combined.length} dailyMean=$${mean.toFixed(2)} sd=$${sd.toFixed(0)} Sharpe(ann)=${((mean / sd) * Math.sqrt(252)).toFixed(2)}\n` +
        `pass=${(summary.passRate * 100).toFixed(1)}% p20=${(summary.pPass20 * 100).toFixed(0)}% ` +
        `p30=${(summary.pPass30 * 100).toFixed(0)}% p45=${(summary.pPass45 * 100).toFixed(0)}% p60=${(summary.pPass60 * 100).toFixed(0)}%\n` +
        `medianDays=${median} p90Days=${summary.p90DaysToPass} fails=${JSON.stringify(summary.failByReason)}\n` +
        `medianDDused=$${summary.medianMaxDdUsed?.toFixed(0)} p90DDused=$${summary.p90MaxDdUsed?.toFixed(0)} avgEnd=$${summary.avgEndEquity.toFixed(0)}\n` +
        `byYear=${JSON.stringify(summary.byYear)}`,
);

if (process.argv.includes("--funded")) {
    const fundedCfg: FundedConfig = {
        ...DEFAULT_FUNDED,
        startingBalanceMode: arg("funded-start", "eval_end") as FundedConfig["startingBalanceMode"],
        maxTrailingDrawdown: maxDd,
        trailMode,
        lockFloorAtStart: lock,
        minWinningDays: Number(arg("min-win-days", "5")),
        minWinDayProfit: Number(arg("min-win-profit", "200")),
        split: Number(arg("split", "0.9")),
        payoutCap: Number(arg("payout-cap", "2000")),
        consistencyMaxBestDayPct: process.argv.includes("--funded-consistency")
            ? Number(arg("funded-consistency"))
            : null,
        timeLimitDays: Number(arg("funded-time", "60")),
    };
    const fundedOutcomes = [];
    for (const o of outcomes) {
        if (!o.passed || o.daysToPass === null) continue;
        const si = dayIndex.get(o.startDate) ?? 0;
        const passIdx = si + o.daysToPass - 1;
        const startIdx = passIdx + 1;
        if (startIdx >= combined.length) continue;
        fundedOutcomes.push(simulateFunded(combined, startIdx, o.endEquity, fundedCfg));
    }
    const funded = summarizeFunded(fundedOutcomes);
    console.log(
        `FUNDED starts=${funded.starts} payoutRate=${(funded.payoutRate * 100).toFixed(1)}% ` +
            `medianDays=${funded.medianDays} p90Days=${funded.p90Days} ` +
            `meanPayout=$${funded.meanPayout.toFixed(0)} givenPaid=$${funded.meanPayoutGivenPaid.toFixed(0)} ` +
            `fails=${JSON.stringify(funded.failByReason)}`,
    );
    const evalFee = Number(arg("eval-fee", "150"));
    const perAttempt = summary.passRate * funded.meanPayoutGivenPaid - evalFee;
    console.log(
        `EV per eval attempt (passRate * payout|pass - fee): ` +
            `${(summary.passRate * 100).toFixed(1)}% * $${funded.meanPayoutGivenPaid.toFixed(0)} - $${evalFee} ` +
            `= $${perAttempt.toFixed(0)}`,
    );
    if (process.argv.includes("--out")) {
        const outF = arg("out");
        fs.writeFileSync(
            outF,
            JSON.stringify({ prop, fundedCfg, symbols, summary, funded, fundedOutcomes }, null, 2),
        );
        console.log(`wrote ${outF}`);
    }
}

const out = process.argv.includes("--out") ? arg("out") : null;
if (out && !process.argv.includes("--funded")) {
    fs.writeFileSync(out, JSON.stringify({ prop, symbols, combined, summary, outcomes }, null, 2));
    console.log(`wrote ${out}`);
}
