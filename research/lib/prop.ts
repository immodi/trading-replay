/**
 * Prop-firm evaluation simulator. This is intentionally separate from the
 * strategy/engine: it consumes the engine's trade list plus an intraday equity
 * path and applies a configurable rule set.
 */
import type { BarEquityPoint, ClosedTrade } from "../../src/backtesting/types.ts";
import { etParts } from "./session.ts";

export interface PropConfig {
    startingBalance: number;
    profitTarget: number;
    maxTrailingDrawdown: number;
    /** "intraday": trail on unrealized highs; "eod": trail on daily close; "static": fixed floor. */
    trailMode: "intraday" | "eod" | "static";
    /** Stop raising the floor once it reaches the starting balance (common firm rule). */
    lockFloorAtStart: boolean;
    /** Absolute loss from the day's starting equity; null disables. */
    dailyLossLimit: number | null;
    /** Best day must be <= this share of total profit; null disables. */
    consistencyMaxBestDayPct: number | null;
    /** Trading days allowed before the eval times out. */
    timeLimitDays: number;
    /** Pass as soon as intraday equity touches target (false = end-of-day only). */
    passOnIntraday: boolean;
}

export const DEFAULT_PROP: PropConfig = {
    startingBalance: 50_000,
    profitTarget: 3_000,
    maxTrailingDrawdown: 2_000,
    trailMode: "intraday",
    lockFloorAtStart: true,
    dailyLossLimit: null,
    consistencyMaxBestDayPct: null,
    timeLimitDays: 60,
    passOnIntraday: true,
};

export interface DayBar {
    time: number;
    date: string;
    /** Equity deltas versus the previous session's last equity (flat overnight). */
    dClose: number;
    dWorst: number;
    dBest: number;
}

export interface Day {
    date: string;
    bars: DayBar[];
    dEnd: number;
}

export interface EvalOutcome {
    startDate: string;
    passed: boolean;
    failReason: "drawdown" | "daily_loss" | "time" | "consistency" | null;
    daysToPass: number | null;
    daysElapsed: number;
    maxDrawdownUsed: number;
    endEquity: number;
    bestDayProfit: number;
    totalProfit: number;
    minEquity: number;
}

export interface EquityBar {
    time: number;
    equity: number;
    eqWorst: number;
    eqBest: number;
}

/** Add conservative intrabar worst/best marks to the engine's close marks. */
export function buildEquityBars(
    points: BarEquityPoint[],
    trades: ClosedTrade[],
    pointValue: number,
    startingCapital: number,
): EquityBar[] {
    const byExit = new Map<number, ClosedTrade[]>();
    for (const t of trades) {
        const list = byExit.get(t.exitTime) ?? [];
        list.push(t);
        byExit.set(t.exitTime, list);
    }

    const out: EquityBar[] = [];
    for (const p of points) {
        const closed = byExit.get(p.time) ?? [];
        let closedNet = 0;
        let closedWorst = 0;
        let closedBest = 0;

        for (const t of closed) {
            closedNet += t.netPnl;

            // A stop or forced close is already the worst fill. Target/strategy
            // exits can still have traded through the bar extreme first.
            let worstGross: number;
            let bestGross: number;
            if (t.exitReason === "stop_loss" || t.exitReason === "end_of_test") {
                worstGross = t.grossPnl;
            } else {
                const price = t.side === "long" ? p.barLow : p.barHigh;
                worstGross =
                    (t.side === "long" ? price - t.entryPrice : t.entryPrice - price) *
                    pointValue *
                    t.quantity;
            }
            if (t.exitReason === "take_profit" || t.exitReason === "end_of_test") {
                bestGross = t.grossPnl;
            } else {
                const price = t.side === "long" ? p.barHigh : p.barLow;
                bestGross =
                    (t.side === "long" ? price - t.entryPrice : t.entryPrice - price) *
                    pointValue *
                    t.quantity;
            }
            closedWorst += worstGross - t.commissionCost;
            closedBest += bestGross - t.commissionCost;
        }

        const realizedBefore = p.realizedNetPnl - closedNet;
        const eqWorst =
            startingCapital + realizedBefore + closedWorst + p.openWorstGross - p.openEntryCommission;
        const eqBest =
            startingCapital + realizedBefore + closedBest + p.openBestGross - p.openEntryCommission;

        out.push({ time: p.time, equity: p.equity, eqWorst, eqBest });
    }
    return out;
}

/** Group absolute equity marks into ET session days with per-bar deltas. */
export function buildDays(bars: EquityBar[], startingCapital: number): Day[] {
    const days: Day[] = [];
    let current: Day | null = null;
    let previousEnd = startingCapital;

    for (const p of bars) {
        const et = etParts(p.time);
        if (et.dow < 1 || et.dow > 5 || et.minutes < 570 || et.minutes >= 960) continue;

        if (current === null || current.date !== et.date) {
            if (current !== null) {
                current.dEnd = current.bars[current.bars.length - 1].dClose;
                previousEnd += current.dEnd;
                days.push(current);
            }
            current = { date: et.date, bars: [], dEnd: 0 };
        }

        current.bars.push({
            time: p.time,
            date: et.date,
            dClose: p.equity - previousEnd,
            dWorst: p.eqWorst - previousEnd,
            dBest: p.eqBest - previousEnd,
        });
    }
    if (current !== null) {
        current.dEnd = current.bars[current.bars.length - 1].dClose;
        days.push(current);
    }
    return days;
}

export function simulateEval(days: Day[], startIndex: number, cfg: PropConfig): EvalOutcome {
    const capital = cfg.startingBalance;
    let equity = capital;
    let peak = capital;
    let minEquity = capital;
    let bestDay = 0;
    let daysElapsed = 0;
    let consistencyPending = false;
    const hardFloor = capital - cfg.maxTrailingDrawdown;

    const finish = (
        passed: boolean,
        failReason: EvalOutcome["failReason"],
        daysToPass: number | null,
        endEquity: number,
    ): EvalOutcome => ({
        startDate: days[startIndex].date,
        passed,
        failReason,
        daysToPass,
        daysElapsed,
        maxDrawdownUsed: peak - minEquity,
        endEquity,
        bestDayProfit: bestDay,
        totalProfit: endEquity - capital,
        minEquity,
    });

    for (let d = startIndex; d < days.length; d++) {
        const day = days[d];
        const dayStart = equity;
        let dayBest = 0;

        for (const bar of day.bars) {
            const eqBest = dayStart + bar.dBest;
            const eqWorst = dayStart + bar.dWorst;
            const eqClose = dayStart + bar.dClose;

            if (cfg.trailMode === "intraday" && eqBest > peak) peak = eqBest;
            if (eqWorst < minEquity) minEquity = eqWorst;

            let floor = cfg.trailMode === "static" ? hardFloor : peak - cfg.maxTrailingDrawdown;
            if (cfg.lockFloorAtStart && floor > capital) floor = capital;

            // Conservative ordering: a bar that both makes a high and breaches
            // the floor counts as a breach.
            if (eqWorst < floor) {
                return finish(false, "drawdown", null, Math.min(equity, eqWorst));
            }

            if (cfg.dailyLossLimit !== null && eqWorst - dayStart <= -cfg.dailyLossLimit) {
                return finish(false, "daily_loss", null, Math.min(equity, eqWorst));
            }

            const passLevel = capital + cfg.profitTarget;
            if (cfg.passOnIntraday ? eqBest >= passLevel : eqClose >= passLevel) {
                const totalProfit = Math.max(0, (cfg.passOnIntraday ? eqBest : eqClose) - capital);
                const bestSoFar = Math.max(bestDay, eqBest - dayStart);
                if (
                    cfg.consistencyMaxBestDayPct === null ||
                    bestSoFar <= cfg.consistencyMaxBestDayPct * totalProfit
                ) {
                    return finish(true, null, daysElapsed + 1, cfg.passOnIntraday ? eqBest : eqClose);
                }
                consistencyPending = true;
            }

            if (eqClose - dayStart > dayBest) dayBest = eqClose - dayStart;
            if (cfg.trailMode === "eod" && eqClose > peak) peak = eqClose;
        }

        daysElapsed += 1;
        equity = dayStart + day.dEnd;
        const dayProfit = equity - dayStart;
        if (dayProfit > bestDay) bestDay = dayProfit;
        else if (dayBest > bestDay) bestDay = dayBest;

        if (cfg.trailMode === "eod" && equity > peak) peak = equity;

        if (daysElapsed >= cfg.timeLimitDays) {
            return finish(false, consistencyPending ? "consistency" : "time", null, equity);
        }
    }

    return finish(false, consistencyPending ? "consistency" : "time", null, equity);
}

export interface EvalSummary {
    starts: number;
    passes: number;
    passRate: number;
    medianDaysToPass: number | null;
    p90DaysToPass: number | null;
    failByReason: Record<string, number>;
    pPass20: number;
    pPass30: number;
    pPass45: number;
    pPass60: number;
    medianMaxDdUsed: number | null;
    p90MaxDdUsed: number | null;
    avgEndEquity: number;
    byYear: Record<string, { starts: number; passes: number; passRate: number }>;
}

function quantile(values: number[], q: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

export function summarizeEvals(
    outcomes: EvalOutcome[],
    horizonEligible: (startDate: string, horizon: number) => boolean,
): EvalSummary {
    const passes = outcomes.filter((o) => o.passed);
    const days = passes.map((o) => o.daysToPass ?? 0);
    const failByReason: Record<string, number> = {};
    for (const o of outcomes) {
        if (!o.passed) {
            const key = o.failReason ?? "unknown";
            failByReason[key] = (failByReason[key] ?? 0) + 1;
        }
    }

    const prob = (horizon: number) => {
        const eligible = outcomes.filter((o) => horizonEligible(o.startDate, horizon));
        if (eligible.length === 0) return 0;
        return (
            eligible.filter((o) => o.passed && (o.daysToPass ?? 999) <= horizon).length /
            eligible.length
        );
    };

    const byYear: Record<string, { starts: number; passes: number; passRate: number }> = {};
    for (const o of outcomes) {
        const y = o.startDate.slice(0, 4);
        const row = byYear[y] ?? { starts: 0, passes: 0, passRate: 0 };
        row.starts += 1;
        if (o.passed) row.passes += 1;
        byYear[y] = row;
    }
    for (const row of Object.values(byYear)) row.passRate = row.passes / row.starts;

    return {
        starts: outcomes.length,
        passes: passes.length,
        passRate: outcomes.length ? passes.length / outcomes.length : 0,
        medianDaysToPass: quantile(days, 0.5),
        p90DaysToPass: quantile(days, 0.9),
        failByReason,
        pPass20: prob(20),
        pPass30: prob(30),
        pPass45: prob(45),
        pPass60: prob(60),
        medianMaxDdUsed: quantile(outcomes.map((o) => o.maxDrawdownUsed), 0.5),
        p90MaxDdUsed: quantile(outcomes.map((o) => o.maxDrawdownUsed), 0.9),
        avgEndEquity: outcomes.reduce((a, o) => a + o.endEquity, 0) / Math.max(1, outcomes.length),
        byYear,
    };
}
