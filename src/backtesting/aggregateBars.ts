import { bucketStart } from "@/utils/candleBucket";
import { PACKED_BAR_STRIDE, formatUtcDateTime } from "./range";
import type { BacktestBar } from "./types";

interface Aggregate {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    count: number;
}

export interface AggregateResult {
    bars: BacktestBar[];
    partialBucketCount: number;
    partialBucketTimes: number[];
}

function finish(aggregate: Aggregate): BacktestBar {
    return Object.freeze({
        time: aggregate.time,
        timeISO: formatUtcDateTime(aggregate.time),
        open: aggregate.open,
        high: aggregate.high,
        low: aggregate.low,
        close: aggregate.close,
        volume: aggregate.volume,
    });
}

function buildResult(
    aggregates: Aggregate[],
    timeframeMinutes: number,
    dropFirst: boolean,
): AggregateResult {
    const retained = dropFirst ? aggregates.slice(1) : aggregates;
    const bars = retained.map(finish);
    const partialBucketTimes = retained
        .filter((aggregate) => aggregate.count < timeframeMinutes)
        .map((aggregate) => aggregate.time);

    return {
        bars,
        partialBucketCount: partialBucketTimes.length,
        partialBucketTimes,
    };
}

/** Aggregate public strategy bars by UTC-aligned timestamp bucket. */
export function aggregateBars(
    bars: BacktestBar[],
    timeframeMinutes: number,
    dropFirst = false,
): AggregateResult {
    const aggregates: Aggregate[] = [];
    let current: Aggregate | null = null;

    for (const bar of bars) {
        const bucket = bucketStart(bar.time, timeframeMinutes);

        if (current === null || bucket > current.time) {
            if (current) aggregates.push(current);

            current = {
                time: bucket,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume,
                count: 1,
            };
            continue;
        }

        if (bucket < current.time) {
            throw new Error(
                `Cannot aggregate out-of-order bar at ${formatUtcDateTime(bar.time)}.`,
            );
        }

        current.high = Math.max(current.high, bar.high);
        current.low = Math.min(current.low, bar.low);
        current.close = bar.close;
        current.volume += bar.volume;
        current.count += 1;
    }

    if (current) aggregates.push(current);

    return buildResult(aggregates, timeframeMinutes, dropFirst);
}

/** Aggregate the worker's packed six-value base-bar buffer. */
export function aggregatePackedBars(
    packed: Float64Array,
    timeframeMinutes: number,
    dropFirst = false,
): AggregateResult {
    const aggregates: Aggregate[] = [];
    let current: Aggregate | null = null;

    for (let offset = 0; offset < packed.length; offset += PACKED_BAR_STRIDE) {
        const time = packed[offset];
        const open = packed[offset + 1];
        const high = packed[offset + 2];
        const low = packed[offset + 3];
        const close = packed[offset + 4];
        const volume = packed[offset + 5];
        const bucket = bucketStart(time, timeframeMinutes);

        if (current === null || bucket > current.time) {
            if (current) aggregates.push(current);

            current = {
                time: bucket,
                open,
                high,
                low,
                close,
                volume,
                count: 1,
            };
            continue;
        }

        if (bucket < current.time) {
            throw new Error(
                `Cannot aggregate out-of-order bar at ${formatUtcDateTime(time)}.`,
            );
        }

        current.high = Math.max(current.high, high);
        current.low = Math.min(current.low, low);
        current.close = close;
        current.volume += volume;
        current.count += 1;
    }

    if (current) aggregates.push(current);

    return buildResult(aggregates, timeframeMinutes, dropFirst);
}
