import assert from "node:assert/strict";
import test from "node:test";

import { analyzeDataQuality } from "../src/backtesting/dataQuality.ts";
import type { Candle } from "../src/types/candle.ts";

const BASE = Date.UTC(2024, 0, 1) / 1000;

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

test("clean candles produce no hard errors or warnings", () => {
    const report = analyzeDataQuality(
        [
            candle(BASE, 100, 101, 99, 100),
            candle(BASE + 60, 100, 101, 99, 100),
            candle(BASE + 120, 100, 101, 99, 100),
        ],
        BASE,
        BASE + 86_400,
        1,
    );

    assert.equal(report.baseBarsInRange, 3);
    assert.deepEqual(report.hardErrors, []);
    assert.deepEqual(report.warnings, []);
});

test("invalid OHLC and non-increasing timestamps are hard errors", () => {
    const report = analyzeDataQuality(
        [
            candle(BASE, 100, 99, 101, 100),
            candle(BASE + 60, 100, 101, 99, 100),
            candle(BASE + 60, 100, 101, 99, 100),
        ],
        BASE,
        BASE + 86_400,
        1,
    );

    assert.ok(report.hardErrors.some((issue) => issue.type === "invalid_ohlc"));
    assert.ok(
        report.hardErrors.some(
            (issue) => issue.type === "non_increasing_timestamps",
        ),
    );
});

test("non-finite values are hard errors", () => {
    const report = analyzeDataQuality(
        [candle(BASE, Number.NaN, 101, 99, 100)],
        BASE,
        BASE + 86_400,
        1,
    );

    assert.ok(report.hardErrors.some((issue) => issue.type === "non_finite_values"));
});

test("gaps, discontinuities, and partial buckets are warnings", () => {
    const report = analyzeDataQuality(
        [
            candle(BASE, 100, 101, 99, 100),
            candle(BASE + 2 * 60, 120, 121, 119, 120),
        ],
        BASE,
        BASE + 86_400,
        5,
    );

    assert.deepEqual(report.hardErrors, []);
    assert.ok(report.warnings.some((issue) => issue.type === "timestamp_gap"));
    assert.ok(
        report.warnings.some((issue) => issue.type === "price_discontinuity"),
    );
    assert.ok(report.warnings.some((issue) => issue.type === "partial_aggregate"));
});

test("negative volume and non-minute-aligned timestamps are hard errors", () => {
    const negativeVolume = analyzeDataQuality(
        [candle(BASE, 100, 101, 99, 100, -1)],
        BASE,
        BASE + 86_400,
        1,
    );
    const misaligned = analyzeDataQuality(
        [candle(BASE + 30, 100, 101, 99, 100)],
        BASE,
        BASE + 86_400,
        1,
    );

    assert.ok(
        negativeVolume.hardErrors.some(
            (issue) => issue.type === "negative_volume",
        ),
    );
    assert.ok(
        misaligned.hardErrors.some(
            (issue) => issue.type === "misaligned_base_timestamp",
        ),
    );
});

test("zero volume remains valid", () => {
    const report = analyzeDataQuality(
        [candle(BASE, 100, 101, 99, 100, 0)],
        BASE,
        BASE + 86_400,
        1,
    );

    assert.deepEqual(report.hardErrors, []);
});

test("warm-up availability is reported", () => {
    const report = analyzeDataQuality(
        [candle(BASE, 100, 101, 99, 100)],
        BASE,
        BASE + 86_400,
        1,
        { requestedBars: 50, availableBars: 17 },
    );

    assert.deepEqual(report.warmup, {
        requestedBars: 50,
        availableBars: 17,
        actualBars: 17,
        insufficient: true,
    });
});
