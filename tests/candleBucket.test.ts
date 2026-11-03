import assert from "node:assert/strict";
import test from "node:test";

import type { Candle } from "@/types/candle";
import { aggregateCandlesByTimeframe, bucketStart } from "../src/utils/candleBucket.ts";

function candle(
    time: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume = 1,
): Candle {
    return {
        time: time as Candle["time"],
        open,
        high,
        low,
        close,
        volume,
        highHistory: [],
        lowHistory: [],
    };
}

test("bucketStart aligns to the timeframe from the Unix epoch", () => {
    assert.equal(bucketStart(120, 5), 0);
    assert.equal(bucketStart(300, 5), 300);
    assert.equal(bucketStart(3_600 + 59 * 60, 60), 3_600);
    assert.equal(bucketStart(86_400 + 60, 1440), 86_400);
});

test("a 5-hour bucket never crosses the UTC day boundary", () => {
    const day = 86_400;

    assert.equal(bucketStart(day + 60, 300), day);
    assert.equal(bucketStart(day + 5 * 3_600, 300), day + 5 * 3_600);
    assert.equal(bucketStart(day + 23 * 3_600, 300), day + 20 * 3_600);
    assert.equal(bucketStart(2 * day + 60, 300), 2 * day);
});

test("aggregation uses timestamp buckets, not row counts", () => {
    // 00:00, 00:01, 00:02 then a gap to 00:04. A 3-minute time frame must
    // produce 00:00 and 00:03 bars; the gap does not extend the first bar.
    const aggregated = aggregateCandlesByTimeframe(
        [
            candle(0, 10, 12, 9, 11, 1),
            candle(60, 11, 13, 10, 12, 2),
            candle(120, 12, 14, 11, 13, 3),
            candle(240, 13, 15, 12, 14, 4),
        ],
        3,
    );

    assert.deepEqual(
        aggregated.map((bar) => ({
            time: bar.time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
        })),
        [
            {
                time: 0,
                open: 10,
                high: 14,
                low: 9,
                close: 13,
                volume: 6,
            },
            {
                time: 180,
                open: 13,
                high: 15,
                low: 12,
                close: 14,
                volume: 4,
            },
        ],
    );
});

test("daily aggregation uses UTC midnight, not 1440 input rows", () => {
    const day = 86_400;

    const aggregated = aggregateCandlesByTimeframe(
        [
            candle(day - 60, 10, 11, 9, 10.5),
            candle(day, 10.5, 12, 10, 11),
            candle(2 * day - 60, 11, 13, 10, 12),
        ],
        1440,
    );

    assert.deepEqual(
        aggregated.map((bar) => bar.time),
        [0, day],
    );
});
