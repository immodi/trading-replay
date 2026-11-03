import assert from "node:assert/strict";
import test from "node:test";

import { assertChronologicalCandles } from "../src/data/sources/candleSource.ts";
import type { Candle } from "../src/types/candle.ts";

const BASE = Date.UTC(2024, 0, 1) / 1000;

function candle(time: number): Candle {
    return {
        time: time as Candle["time"],
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1,
        highHistory: [],
        lowHistory: [],
    };
}

test("strictly increasing timestamps pass", () => {
    assert.doesNotThrow(() =>
        assertChronologicalCandles([
            candle(BASE),
            candle(BASE + 60),
            candle(BASE + 120),
        ]),
    );
});

test("duplicate, non-increasing, and non-finite timestamps are rejected", () => {
    assert.throws(
        () =>
            assertChronologicalCandles([
                candle(BASE),
                candle(BASE + 60),
                candle(BASE + 60),
            ]),
        /not strictly chronological/,
    );

    assert.throws(
        () =>
            assertChronologicalCandles([
                candle(BASE + 60),
                candle(BASE),
            ]),
        /not strictly chronological/,
    );

    assert.throws(
        () =>
            assertChronologicalCandles([
                candle(BASE),
                candle(Number.NaN),
            ]),
        /not strictly chronological/,
    );
});
