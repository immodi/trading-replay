/**
 * Conditional analysis: does trailing strategy performance predict the next
 * prop-eval outcome? Uses only information available at the eval start.
 *
 * Example:
 *   node --import tsx research/conditional.ts --dir research/results/mnq-r500 --symbol mnq
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROP, simulateEval } from "./lib/prop.ts";
import type { Day } from "./lib/prop.ts";
import type { ClosedTrade } from "../src/backtesting/types.ts";

function arg(name: string, fallback?: string): string {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx >= 0 && process.argv[idx + 1] !== undefined) return process.argv[idx + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing --${name}`);
}

const dir = arg("dir");
const symbol = arg("symbol", "mnq");
const risk = Number(arg("risk", "500"));
const trailingTrades = Number(arg("trailing", "60"));

const file = JSON.parse(fs.readFileSync(path.join(dir, `${symbol}.json`), "utf8")) as {
    days: Day[];
    trades: ClosedTrade[];
};
const days = file.days;
const trades = [...file.trades].sort((a, b) => a.exitTime - b.exitTime);

const prop = { ...DEFAULT_PROP, maxTrailingDrawdown: 2000, profitTarget: 3000, timeLimitDays: 60, trailMode: "intraday" as const };

interface Row {
    date: string;
    passed: boolean;
    daysToPass: number | null;
    trailingPnl: number;
    trailingWin: number;
}

const rows: Row[] = [];
let cursor = 0;
for (let i = 0; i < days.length; i++) {
    const dayStartTs = Math.floor(Date.parse(`${days[i].date}T00:00:00Z`) / 1000);
    while (cursor < trades.length && trades[cursor].exitTime < dayStartTs) cursor++;
    const recent = trades.slice(Math.max(0, cursor - trailingTrades), cursor);
    if (recent.length < trailingTrades) continue;
    const trailingPnl = recent.reduce((a, t) => a + t.netPnl, 0);
    const trailingWin = recent.filter((t) => t.netPnl > 0).length / recent.length;
    const outcome = simulateEval(days, i, prop);
    rows.push({ date: days[i].date, passed: outcome.passed, daysToPass: outcome.daysToPass, trailingPnl, trailingWin });
}

const buckets = [
    { label: "trailing 60 trades < -1000", test: (r: Row) => r.trailingPnl < -1000 },
    { label: "-1000 .. 0", test: (r: Row) => r.trailingPnl >= -1000 && r.trailingPnl < 0 },
    { label: "0 .. +1000", test: (r: Row) => r.trailingPnl >= 0 && r.trailingPnl <= 1000 },
    { label: "> +1000", test: (r: Row) => r.trailingPnl > 1000 },
];

console.log(`MNQ conditional outcomes, risk $${risk}, trailing ${trailingTrades} trades, starts=${rows.length}`);
for (const b of buckets) {
    const sub = rows.filter(b.test);
    const passes = sub.filter((r) => r.passed);
    const p30 = sub.filter((r) => r.passed && (r.daysToPass ?? 999) <= 30).length / Math.max(1, sub.length);
    const p60 = passes.length / Math.max(1, sub.length);
    const avg = sub.reduce((a, r) => a + r.trailingPnl, 0) / Math.max(1, sub.length);
    console.log(
        `${b.label.padEnd(28)} starts=${String(sub.length).padStart(3)} pass60=${(100 * p60).toFixed(1)}% p30=${(100 * p30).toFixed(1)}% avgTrail=$${avg.toFixed(0)}`,
    );
}

// Quintiles by trailing PnL.
const sorted = [...rows].sort((a, b) => a.trailingPnl - b.trailingPnl);
console.log("\nQuintiles (worst -> best trailing 60-trade PnL):");
for (let q = 0; q < 5; q++) {
    const sub = sorted.slice(Math.floor((q * sorted.length) / 5), Math.floor(((q + 1) * sorted.length) / 5));
    const pass = sub.filter((r) => r.passed).length / Math.max(1, sub.length);
    console.log(
        `Q${q + 1} n=${sub.length} trailRange=$${sub[0]?.trailingPnl.toFixed(0)}..$${sub[sub.length - 1]?.trailingPnl.toFixed(0)} pass60=${(100 * pass).toFixed(1)}%`,
    );
}
