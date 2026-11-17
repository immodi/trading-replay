/**
 * Funded-account phase after a passed evaluation.
 *
 * Walks forward from the day after the pass using the same combined equity
 * path and applies a configurable payout rule set. The result is conditional
 * on having passed, which is exactly the "time from funding to first payout"
 * question.
 */
import type { Day } from "./prop.ts";

export interface FundedConfig {
    /** "eval_end" carries the pass balance forward; "reset" restarts at 50k. */
    startingBalanceMode: "eval_end" | "reset";
    maxTrailingDrawdown: number;
    trailMode: "intraday" | "eod" | "static";
    lockFloorAtStart: boolean;
    /** Winning days needed before the first payout. */
    minWinningDays: number;
    /** A day counts as winning at or above this profit. */
    minWinDayProfit: number;
    /** Payout share of profit. */
    split: number;
    /** Cap on the first payout, in dollars. */
    payoutCap: number;
    /** Best day must be <= this share of total profit; null disables. */
    consistencyMaxBestDayPct: number | null;
    timeLimitDays: number;
}

export const DEFAULT_FUNDED: FundedConfig = {
    startingBalanceMode: "eval_end",
    maxTrailingDrawdown: 2_000,
    trailMode: "intraday",
    lockFloorAtStart: true,
    minWinningDays: 5,
    minWinDayProfit: 200,
    split: 0.9,
    payoutCap: 2_000,
    consistencyMaxBestDayPct: null,
    timeLimitDays: 60,
};

export interface FundedOutcome {
    startDate: string;
    paid: boolean;
    failReason: "drawdown" | "time" | "consistency" | null;
    daysToPayout: number | null;
    payout: number;
    totalProfit: number;
    maxDrawdownUsed: number;
}

export function simulateFunded(
    days: Day[],
    startIndex: number,
    startBalance: number,
    cfg: FundedConfig,
): FundedOutcome {
    const capital = cfg.startingBalanceMode === "reset" ? 50_000 : startBalance;
    let equity = capital;
    let peak = capital;
    let minEquity = capital;
    let winningDays = 0;
    let bestDay = 0;
    let elapsed = 0;
    const hardFloor = capital - cfg.maxTrailingDrawdown;

    const finish = (
        paid: boolean,
        failReason: FundedOutcome["failReason"],
        daysToPayout: number | null,
        payout: number,
    ): FundedOutcome => ({
        startDate: days[startIndex]?.date ?? "",
        paid,
        failReason,
        daysToPayout,
        payout,
        totalProfit: equity - capital,
        maxDrawdownUsed: peak - minEquity,
    });

    for (let d = startIndex; d < days.length; d++) {
        const day = days[d];
        const dayStart = equity;

        for (const bar of day.bars) {
            const eqWorst = dayStart + bar.dWorst;
            const eqBest = dayStart + bar.dBest;
            if (cfg.trailMode === "intraday" && eqBest > peak) peak = eqBest;
            if (eqWorst < minEquity) minEquity = eqWorst;

            let floor = cfg.trailMode === "static" ? hardFloor : peak - cfg.maxTrailingDrawdown;
            if (cfg.lockFloorAtStart && floor > capital) floor = capital;
            if (eqWorst < floor) {
                return finish(false, "drawdown", null, 0);
            }
        }

        elapsed += 1;
        equity = dayStart + day.dEnd;
        const profit = equity - dayStart;
        if (profit >= cfg.minWinDayProfit) winningDays += 1;
        if (profit > bestDay) bestDay = profit;

        if (cfg.trailMode === "eod" && equity > peak) peak = equity;
        if (equity < minEquity) minEquity = equity;

        const totalProfit = equity - capital;
        const consistencyOk =
            cfg.consistencyMaxBestDayPct === null ||
            (totalProfit > 0 && bestDay <= cfg.consistencyMaxBestDayPct * totalProfit);

        if (winningDays >= cfg.minWinningDays && totalProfit > 0 && consistencyOk) {
            const payout = Math.min(totalProfit, cfg.payoutCap) * cfg.split;
            return finish(true, null, elapsed, payout);
        }

        if (elapsed >= cfg.timeLimitDays) {
            const reason =
                winningDays >= cfg.minWinningDays && !consistencyOk ? "consistency" : "time";
            return finish(false, reason, null, 0);
        }
    }

    return finish(false, "time", null, 0);
}

export interface FundedSummary {
    starts: number;
    payouts: number;
    payoutRate: number;
    medianDays: number | null;
    p90Days: number | null;
    meanPayout: number;
    meanPayoutGivenPaid: number;
    failByReason: Record<string, number>;
    medianDdUsed: number | null;
}

function quantile(values: number[], q: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

export function summarizeFunded(outcomes: FundedOutcome[]): FundedSummary {
    const paid = outcomes.filter((o) => o.paid);
    const failByReason: Record<string, number> = {};
    for (const o of outcomes) {
        if (!o.paid) {
            const key = o.failReason ?? "unknown";
            failByReason[key] = (failByReason[key] ?? 0) + 1;
        }
    }
    const days = paid.map((o) => o.daysToPayout ?? 0);
    return {
        starts: outcomes.length,
        payouts: paid.length,
        payoutRate: outcomes.length ? paid.length / outcomes.length : 0,
        medianDays: quantile(days, 0.5),
        p90Days: quantile(days, 0.9),
        meanPayout: outcomes.length ? outcomes.reduce((a, o) => a + o.payout, 0) / outcomes.length : 0,
        meanPayoutGivenPaid: paid.length ? paid.reduce((a, o) => a + o.payout, 0) / paid.length : 0,
        failByReason,
        medianDdUsed: quantile(outcomes.map((o) => o.maxDrawdownUsed), 0.5),
    };
}
