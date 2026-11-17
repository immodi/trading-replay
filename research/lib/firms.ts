/**
 * Example prop-firm presets. Values are illustrative and MUST be checked
 * against the current rules of the firm you actually buy from; firms change
 * targets, drawdown type, consistency and payout rules frequently.
 *
 * The simulator reads every field; add a preset here or pass CLI overrides.
 */
import { DEFAULT_PROP } from "./prop.ts";
import type { PropConfig } from "./prop.ts";
import type { FundedConfig } from "./funded.ts";
import { DEFAULT_FUNDED } from "./funded.ts";

export interface FirmPreset {
    name: string;
    eval: PropConfig;
    funded: FundedConfig;
}

export const FIRM_PRESETS: Record<string, FirmPreset> = {
    /** Task default: 50k, +3k, 2k trailing on intraday unrealized PnL. */
    generic50k: {
        name: "Generic 50k (task default)",
        eval: DEFAULT_PROP,
        funded: DEFAULT_FUNDED,
    },

    /** A firmer intraday trail, no daily loss limit, 30-day window. */
    aggressiveIntraday50k: {
        name: "50k intraday-trail, 30 days",
        eval: {
            ...DEFAULT_PROP,
            maxTrailingDrawdown: 2_000,
            trailMode: "intraday",
            lockFloorAtStart: true,
            dailyLossLimit: null,
            consistencyMaxBestDayPct: null,
            timeLimitDays: 30,
        },
        funded: {
            ...DEFAULT_FUNDED,
            minWinningDays: 5,
            minWinDayProfit: 200,
            split: 0.9,
            payoutCap: 2_000,
            consistencyMaxBestDayPct: 0.4,
        },
    },

    /** Example of an end-of-day trailing threshold plus a daily loss limit. */
    eodTrailWithDailyLimit50k: {
        name: "50k EOD trail, $1,000 daily loss",
        eval: {
            ...DEFAULT_PROP,
            maxTrailingDrawdown: 2_000,
            trailMode: "eod",
            lockFloorAtStart: true,
            dailyLossLimit: 1_000,
            consistencyMaxBestDayPct: null,
            timeLimitDays: 60,
        },
        funded: {
            ...DEFAULT_FUNDED,
            trailMode: "eod",
            minWinningDays: 5,
            minWinDayProfit: 200,
            consistencyMaxBestDayPct: 0.5,
        },
    },

    /** Static drawdown (rare, but much easier): useful as an upper bound. */
    staticDrawdown50k: {
        name: "50k static drawdown",
        eval: {
            ...DEFAULT_PROP,
            maxTrailingDrawdown: 2_000,
            trailMode: "static",
            lockFloorAtStart: false,
            dailyLossLimit: null,
            consistencyMaxBestDayPct: null,
            timeLimitDays: 60,
        },
        funded: {
            ...DEFAULT_FUNDED,
            trailMode: "static",
            lockFloorAtStart: false,
        },
    },
};
