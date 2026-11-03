import assert from "node:assert/strict";
import test from "node:test";

import { aggregateBars, aggregatePackedBars } from "../src/backtesting/aggregateBars.ts";
import { packCandles } from "../src/backtesting/range.ts";
import type { BacktestBar } from "../src/backtesting/types.ts";
import type { Candle } from "../src/types/candle.ts";

const BASE = Date.UTC(2024, 0, 1) / 1000;

function bar(
    time: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume = 1,
): BacktestBar {
    return {
        time,
        timeISO: new Date(time * 1000).toISOString(),
        open,
        high,
        low,
        close,
        volume,
    };
}

test("aggregation uses timestamp buckets and preserves OHLCV", () => {
    const result = aggregateBars(
        [
            bar(BASE, 10, 12, 9, 11, 1),
            bar(BASE + 60, 11, 13, 10, 12, 2),
            bar(BASE + 3 * 60, 12, 14, 11, 13, 3),
            bar(BASE + 5 * 60, 13, 15, 12, 14, 4),
        ],
        5,
    );

    assert.deepEqual(
        result.bars.map((item) => ({
            time: item.time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
        })),
        [
            {
                time: BASE,
                open: 10,
                high: 14,
                low: 9,
                close: 13,
                volume: 6,
            },
            {
                time: BASE + 5 * 60,
                open: 13,
                high: 15,
                low: 12,
                close: 14,
                volume: 4,
            },
        ],
    );

    assert.equal(result.partialBucketCount, 2);
});

test("a gap inside a bucket does not split the bucket or duplicate timestamps", () => {
    const result = aggregateBars(
        [
            bar(BASE, 10, 11, 9, 10),
            bar(BASE + 60, 10, 12, 10, 11),
            bar(BASE + 3 * 60, 11, 13, 11, 12),
        ],
        5,
    );

    assert.equal(result.bars.length, 1);
    assert.equal(result.bars[0].time, BASE);
    assert.equal(result.bars[0].close, 12);
    assert.equal(result.partialBucketCount, 1);
});

test("packed aggregation matches object aggregation and can drop a leading partial bucket", () => {
    const candles: Candle[] = [
        {
            time: (BASE - 60) as Candle["time"],
            open: 9,
            high: 10,
            low: 8,
            close: 9,
            volume: 1,
            highHistory: [],
            lowHistory: [],
        },
        {
            time: BASE as Candle["time"],
            open: 10,
            high: 11,
            low: 9,
            close: 10,
            volume: 2,
            highHistory: [],
            lowHistory: [],
        },
        {
            time: (BASE + 60) as Candle["time"],
            open: 10,
            high: 12,
            low: 10,
            close: 11,
            volume: 3,
            highHistory: [],
            lowHistory: [],
        },
    ];

    const packed = packCandles(candles, 0, candles.length);
    const result = aggregatePackedBars(packed, 5, true);

    assert.equal(result.bars.length, 1);
    assert.equal(result.bars[0].time, BASE);
    assert.equal(result.bars[0].open, 10);
    assert.equal(result.bars[0].close, 11);
    assert.equal(result.bars[0].volume, 5);
});

test("out-of-order bars are rejected rather than silently merged", () => {
    assert.throws(
        () =>
            aggregateBars(
                [
                    bar(BASE + 5 * 60, 10, 11, 9, 10),
                    bar(BASE, 10, 11, 9, 10),
                ],
                5,
            ),
        /out-of-order/,
    );
});

test("range selection includes enough pre-start strategy buckets", async () => {
    const { selectBaseRange } = await import("../src/backtesting/range.ts");
    const candles: Candle[] = Array.from({ length: 20 }, (_, index) => ({
        time: (BASE + index * 60) as Candle["time"],
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1,
        highHistory: [],
        lowHistory: [],
    }));

    const range = selectBaseRange(
        candles,
        BASE + 10 * 60,
        BASE + 15 * 60,
        1,
        2,
        3,
    );

    assert.equal(range.from, 3);
    assert.equal(range.dropFirstAggregate, true);
    assert.equal(range.availableWarmupBars, 6);
    assert.equal(range.empty, false);
});
