import assert from "node:assert/strict";
import test from "node:test";

import { aggregatePackedBars } from "../src/backtesting/aggregateBars.ts";
import { packCandles, selectBaseRange } from "../src/backtesting/range.ts";
import { runBacktest } from "../src/backtesting/runBacktest.ts";
import type { BacktestRunConfig } from "../src/backtesting/types.ts";
import type { Candle } from "../src/types/candle.ts";

const BASE = Date.UTC(2024, 0, 1) / 1000;

test("range selection, packing, aggregation, and simulation work end to end", () => {
    const candles: Candle[] = Array.from({ length: 40 }, (_, index) => ({
        time: (BASE + index * 60) as Candle["time"],
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1,
        highHistory: [],
        lowHistory: [],
    }));

    const startTs = BASE + 20 * 60;
    const endTsExclusive = BASE + 30 * 60;
    const selection = selectBaseRange(
        candles,
        startTs,
        endTsExclusive,
        5,
        3,
        10,
    );

    assert.equal(selection.availableWarmupBars, 4);

    const packed = packCandles(candles, selection.from, selection.to);
    const aggregated = aggregatePackedBars(
        packed,
        5,
        selection.dropFirstAggregate,
    );
    const config: BacktestRunConfig = {
        instrument: {
            id: "test",
            symbol: "TEST",
            pointValue: 2,
            commissionPerSide: 0,
        },
        startDateUTC: "2024-01-01",
        endDateUTC: "2024-01-01",
        startTs,
        endTsExclusive,
        timeframeMinutes: 5,
        startingCapital: 10_000,
        slippagePointsPerSide: 0,
        maxOpenPositions: 1,
        warmupBars: 3,
        maxLookbackBars: 10,
        parameters: {},
    };
    const seen: Array<{ index: number; warmup: boolean }> = [];

    const result = runBacktest({
        bars: aggregated.bars,
        config,
        strategy: {
            onBar(context) {
                seen.push({
                    index: context.index,
                    warmup: context.isWarmup,
                });
                return null;
            },
        },
    });

    assert.deepEqual(result.dataQuality.warmup, {
        requestedBars: 3,
        availableBars: 4,
        actualBars: 3,
        insufficient: false,
    });
    assert.deepEqual(seen, [
        { index: 0, warmup: true },
        { index: 1, warmup: true },
        { index: 2, warmup: true },
        { index: 3, warmup: false },
        { index: 4, warmup: false },
    ]);
});
