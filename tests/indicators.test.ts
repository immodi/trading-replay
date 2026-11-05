import assert from "node:assert/strict";
import test from "node:test";
import type { UTCTimestamp } from "lightweight-charts";

import { ATRIndicator } from "../src/indicators/atr.ts";
import { RSIIndicator } from "../src/indicators/rsi.ts";
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
