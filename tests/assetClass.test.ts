import assert from "node:assert/strict";
import test from "node:test";

import {
    availableTimeframes,
    normaliseTimeframe,
    resolveBaseTimeframe,
} from "../src/constants/assetClass.ts";
import { withSourceDefaults } from "../src/data/sources/config.ts";

test("stock configs default to a daily, point-value-1 source", () => {
    const config = withSourceDefaults({
        id: "comi",
        symbol: "COMI",
        assetClass: "stock",
        fileName: "comi-1d.json",
    });

    assert.equal(config.assetClass, "stock");
    assert.equal(config.pointValue, 1);
    assert.equal(config.baseTimeframeMinutes, 1440);
    assert.equal(config.currency, "USD");
    assert.equal(config.commission, 0);
});

test("stock point value is always forced to 1 for currency-native P/L", () => {
    const config = withSourceDefaults({
        id: "comi",
        symbol: "COMI",
        assetClass: "stock",
        pointValue: 5,
        fileName: "comi-1d.json",
    });

    assert.equal(config.pointValue, 1);
});

test("legacy configs without market fields remain futures 1-minute sources", () => {
    const config = withSourceDefaults({
        id: "mnq",
        symbol: "MNQ",
        pointValue: 2,
        fileName: "mnq-1m.json",
    });

    assert.equal(config.assetClass, "futures");
    assert.equal(config.baseTimeframeMinutes, 1);
    assert.equal(resolveBaseTimeframe(config), 1);
});

test("timeframes must be multiples of the stored base resolution", () => {
    const daily = availableTimeframes(1440).map((timeframe) => timeframe.value);

    assert.deepEqual(daily, [1440, 10_080, 43_200, 129_600, 525_600]);

    const minute = availableTimeframes(1).map((timeframe) => timeframe.value);
    assert.ok(minute.includes(1));
    assert.ok(minute.includes(15));
    assert.ok(minute.includes(1440));
    assert.ok(!minute.includes(10_080));
});

test("requested timeframes are clamped to what the base can produce", () => {
    assert.equal(normaliseTimeframe(5, 1440), 1440);
    assert.equal(normaliseTimeframe(15, 1), 15);
    assert.equal(normaliseTimeframe(4, 1), 5);
    assert.equal(normaliseTimeframe(7, 5), 15);
});
