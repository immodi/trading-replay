import type { Candle } from "@/types/candle";
import { bucketStart } from "@/utils/candleBucket";

export const PACKED_BAR_STRIDE = 6;

export function parseUtcDate(date: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

    if (!match) {
        throw new Error(`Invalid UTC date "${date}". Expected YYYY-MM-DD.`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const ms = Date.UTC(year, month - 1, day);

    const parsed = new Date(ms);

    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        throw new Error(`Invalid UTC date "${date}".`);
    }

    return Math.floor(ms / 1000);
}

export function formatUtcDate(date: Date | number): string {
    const value = typeof date === "number" ? new Date(date * 1000) : date;
    return value.toISOString().slice(0, 10);
}

export function formatUtcDateTime(seconds: number): string {
    return new Date(seconds * 1000).toISOString();
}

/** First index whose candle time is >= target. */
export function lowerBound(candles: Candle[], target: number): number {
    let low = 0;
    let high = candles.length;

    while (low < high) {
        const middle = (low + high) >>> 1;
        if (candles[middle].time < target) low = middle + 1;
        else high = middle;
    }

    return low;
}

export interface BaseRangeSelection {
    from: number;
    to: number;
    firstInRangeIndex: number;
    endIndex: number;
    dropFirstAggregate: boolean;
    empty: boolean;
}

/**
 * Select enough base bars to build the in-range strategy bars plus the
 * requested warm-up and history window. The worker aggregates this slice.
 */
export function selectBaseRange(
    candles: Candle[],
    startTs: number,
    endTsExclusive: number,
    timeframeMinutes: number,
    warmupBars: number,
    maxLookbackBars: number,
): BaseRangeSelection {
    const firstInRangeIndex = lowerBound(candles, startTs);
    const endIndex = lowerBound(candles, endTsExclusive);
    const neededBuckets = maxLookbackBars + warmupBars + 2;
    let from = firstInRangeIndex;

    if (neededBuckets > 0 && firstInRangeIndex > 0) {
        const seenBuckets = new Set<number>();

        for (let index = firstInRangeIndex - 1; index >= 0; index -= 1) {
            const bucket = bucketStart(candles[index].time, timeframeMinutes);

            if (!seenBuckets.has(bucket)) {
                seenBuckets.add(bucket);
                from = index;

                if (seenBuckets.size >= neededBuckets) break;
            }
        }

        if (seenBuckets.size < neededBuckets) from = 0;

        if (from > 0) {
            const fromBucket = bucketStart(
                candles[from].time,
                timeframeMinutes,
            );

            while (
                from > 0 &&
                bucketStart(candles[from - 1].time, timeframeMinutes) ===
                    fromBucket
            ) {
                from -= 1;
            }
        }
    }

    return {
        from,
        to: endIndex,
        firstInRangeIndex,
        endIndex,
        dropFirstAggregate: from > 0,
        empty: firstInRangeIndex >= endIndex,
    };
}

/** Pack base candles into the worker transfer format. */
export function packCandles(
    candles: Candle[],
    from: number,
    to: number,
): Float64Array {
    const count = Math.max(0, to - from);
    const packed = new Float64Array(count * PACKED_BAR_STRIDE);

    for (let index = 0; index < count; index += 1) {
        const candle = candles[from + index];
        const offset = index * PACKED_BAR_STRIDE;

        packed[offset] = candle.time;
        packed[offset + 1] = candle.open;
        packed[offset + 2] = candle.high;
        packed[offset + 3] = candle.low;
        packed[offset + 4] = candle.close;
        packed[offset + 5] = candle.volume;
    }

    return packed;
}
