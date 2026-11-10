import assert from "node:assert/strict";
import test from "node:test";
import type { UTCTimestamp } from "lightweight-charts";

import { ADXIndicator } from "../src/indicators/adx.ts";
import { ATRIndicator } from "../src/indicators/atr.ts";
import { RSIIndicator } from "../src/indicators/rsi.ts";
import { VWAPBandsIndicator } from "../src/indicators/vwapBands.ts";
import type { PriceData } from "../src/types/priceData.ts";

function bars(
    prices: number[],
    highOffset = 1,
    lowOffset = 1,
): PriceData[] {
    return prices.map((price, index) => ({
        Time: index as UTCTimestamp,
        Price: price,
        High: price + highOffset,
        Low: price - lowOffset,
        Volume: 1,
    }));
}

test("RSI is neutral on flat prices and pegged on a pure uptrend", () => {
    const flat = new RSIIndicator(14, bars(Array.from({ length: 20 }, () => 100)));
    assert.equal(flat.getData().at(-1)?.value, 50);

    const rising = new RSIIndicator(
        14,
        bars(Array.from({ length: 20 }, (_, index) => 100 + index)),
    );
    assert.equal(rising.getData().at(-1)?.value, 100);
});

test("ATR uses the simple average true range", () => {
    const atr = new ATRIndicator(14, bars(Array.from({ length: 20 }, () => 100)));
    assert.equal(atr.getData().at(-1)?.value, 2);
});

test("ADX rises on a pure trend and is zero on flat prices", () => {
    const rising = new ADXIndicator(
        14,
        bars(Array.from({ length: 80 }, (_, index) => 100 + index)),
    );
    assert.ok((rising.getData().at(-1)?.value ?? 0) > 90);

    const flat = new ADXIndicator(
        14,
        bars(Array.from({ length: 80 }, () => 100)),
    );
    assert.equal(flat.getData().at(-1)?.value, 0);
});

test("VWAP bands render one, two, and three standard deviations", () => {
    const candles: PriceData[] = [
        { Time: 0 as UTCTimestamp, Price: 100, High: 101, Low: 99, Volume: 1 },
        { Time: 1 as UTCTimestamp, Price: 110, High: 111, Low: 109, Volume: 1 },
    ];
    const bands = new VWAPBandsIndicator(candles);
    const data = bands.getData();

    assert.equal(data.vwap.at(-1)?.value, 105);
    assert.deepEqual(
        data.bands.map((band) => band.multiplier),
        [1, 2, 3],
    );
    assert.deepEqual(
        data.bands.map((band) => band.upper.at(-1)?.value),
        [110, 115, 120],
    );
    assert.deepEqual(
        data.bands.map((band) => band.lower.at(-1)?.value),
        [100, 95, 90],
    );
});

test("VWAP bands weight the variance by volume", () => {
    const candles: PriceData[] = [
        { Time: 0 as UTCTimestamp, Price: 100, High: 101, Low: 99, Volume: 3 },
        { Time: 1 as UTCTimestamp, Price: 110, High: 111, Low: 109, Volume: 1 },
    ];
    const bands = new VWAPBandsIndicator(candles);
    const point = bands.update({
        Time: 1 as UTCTimestamp,
        Price: 110,
        High: 111,
        Low: 109,
        Volume: 1,
    });

    // Repeating the latest bar must not double-count its contribution.
    assert.equal(point.vwap, 102.5);
    assert.ok(Math.abs(point.standardDeviation - Math.sqrt(18.75)) < 1e-10);
    assert.equal(point.bands.length, 3);
});
