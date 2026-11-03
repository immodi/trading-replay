import type { Candle } from "@/types/candle";
import { aggregateCandle } from "./aggregateCandle";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 86_400;

/**
 * Start of the UTC-aligned bucket that contains `time` for a timeframe of
 * `timeframeMinutes`.
 *
 * Buckets are anchored at UTC midnight so a bar never crosses a replay day
 * boundary. Timeframes that divide a day (1m, 3m, 5m, 15m, 1h, 1d) are then
 * also aligned to the Unix epoch; the 5-hour frame deliberately starts its
 * last bucket at 20:00 UTC and lets it end at midnight.
 */
export function bucketStart(
    time: number,
    timeframeMinutes: number,
): number {
    const bucketSeconds =
        Math.max(1, Math.floor(timeframeMinutes)) * SECONDS_PER_MINUTE;
    const dayStart = Math.floor(time / SECONDS_PER_DAY) * SECONDS_PER_DAY;

    return dayStart + Math.floor((time - dayStart) / bucketSeconds) * bucketSeconds;
}

/**
 * Aggregate chronological 1‑minute candles into timestamp buckets.
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
