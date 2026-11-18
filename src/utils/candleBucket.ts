import { Timeframe } from "@/constants/toolbar";
import type { Candle } from "@/types/candle";
import { aggregateCandle } from "./aggregateCandle";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 86_400;

function utcDayStart(time: number): number {
    return Math.floor(time / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}

function startOfUtcWeek(time: number): number {
    const date = new Date(time * 1000);
    const dayOfWeek = date.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;

    return Math.floor(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate() - daysSinceMonday,
        ) / 1000,
    );
}

function startOfUtcMonth(time: number): number {
    const date = new Date(time * 1000);

    return Math.floor(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000,
    );
}

function startOfUtcQuarter(time: number): number {
    const date = new Date(time * 1000);
    const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;

    return Math.floor(
        Date.UTC(date.getUTCFullYear(), quarterMonth, 1) / 1000,
    );
}

function startOfUtcYear(time: number): number {
    const date = new Date(time * 1000);
    return Math.floor(Date.UTC(date.getUTCFullYear(), 0, 1) / 1000);
}

/**
 * Start of the UTC-aligned bucket that contains `time` for a timeframe of
 * `timeframeMinutes`.
 *
 * Intraday buckets are anchored at UTC midnight so a bar never crosses a
 * replay day boundary. Daily data can also be aggregated into calendar
 * periods: weeks start Monday, quarters start Jan/Apr/Jul/Oct, and months and
 * years start on the 1st. Those calendar buckets have variable length, which
 * is why they cannot be handled as fixed minute counts.
 */
export function bucketStart(
    time: number,
    timeframeMinutes: number,
): number {
    const minutes = Math.max(1, Math.floor(timeframeMinutes));

    switch (minutes) {
        case Timeframe.Week1:
            return startOfUtcWeek(time);
        case Timeframe.Month1:
            return startOfUtcMonth(time);
        case Timeframe.Quarter3:
            return startOfUtcQuarter(time);
        case Timeframe.Year1:
            return startOfUtcYear(time);
        default:
            break;
    }

    const bucketSeconds = minutes * SECONDS_PER_MINUTE;

    // Fixed multi-day periods (not currently exposed) still align to the
    // Unix epoch instead of resetting each UTC day.
    if (bucketSeconds >= SECONDS_PER_DAY) {
        return Math.floor(time / bucketSeconds) * bucketSeconds;
    }

    const dayStart = utcDayStart(time);
    return dayStart + Math.floor((time - dayStart) / bucketSeconds) * bucketSeconds;
}

/**
 * Aggregate chronological base candles into timestamp buckets.
 *
 * A bucket is opened by the first candle inside it and closed when a candle
 * from a later bucket arrives. Missing minutes therefore do not shift the
 * boundaries, and gaps/session breaks start a new bucket instead of being
 * counted as extra rows in the previous bar.
 */
export function aggregateCandlesByTimeframe(
    candles: Candle[],
    timeframeMinutes: number,
): Candle[] {
    const aggregated: Candle[] = [];

    let current: Candle | null = null;
    let currentBucket: number | null = null;

    for (const candle of candles) {
        const bucket = bucketStart(candle.time, timeframeMinutes);

        if (current === null || currentBucket === null || bucket > currentBucket) {
            current = {
                ...candle,
                time: bucket as Candle["time"],
                highHistory: [],
                lowHistory: [],
            };
            currentBucket = bucket;
            aggregated.push(current);
            continue;
        }

        // Out-of-order rows cannot be placed into an already-closed bucket.
        if (bucket < currentBucket) {
            continue;
        }

        current = aggregateCandle(current, candle);
        aggregated[aggregated.length - 1] = current;
    }

    return aggregated;
}
