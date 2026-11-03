import assert from "node:assert/strict";
import test from "node:test";

import type { Position } from "@/types/position";
import type { PriceData } from "@/types/priceData";
import { applyPriceTick } from "../src/utils/applyPriceTick.ts";

function position(overrides: Partial<Position>): Position {
    return {
        id: "00000000-0000-0000-0000-000000000000",
        side: "long",
        state: "open",
        orderType: "market",
        quantity: 1,
        entryPrice: 100,
        entryTime: 0 as Position["entryTime"],
        ...overrides,
    } as Position;
}

function price(
    priceValue: number,
    high: number,
    low: number,
    time = 60,
): PriceData {
    return {
        Price: priceValue,
        Time: time as PriceData["Time"],
        High: high,
        Low: low,
        Volume: 1,
    };
}

test("take-profit fills on a new high even when the close is unchanged", () => {
    const [next] = applyPriceTick(
        [position({ takeProfit: 105 })],
        price(100, 100, 100, 0),
        price(100, 106, 100, 60),
    );

    assert.equal(next.state, "close");
    assert.equal(next.exitPrice, 105);
    assert.equal(next.exitTime, 60);
});

test("stop-loss fills on a new low even when the close is unchanged", () => {
    const [next] = applyPriceTick(
        [position({ stopLoss: 95 })],
        price(100, 100, 100, 0),
        price(100, 100, 94, 60),
    );

    assert.equal(next.state, "close");
    assert.equal(next.exitPrice, 95);
});

test("a buy stop only fills on an upward cross", () => {
    const [down] = applyPriceTick(
        [position({ state: "waiting", orderType: "stop", entryPrice: 105 })],
        price(110, 110, 109, 0),
        price(100, 100, 99, 60),
    );

    assert.equal(down.state, "waiting");

    const [up] = applyPriceTick(
        [position({ state: "waiting", orderType: "stop", entryPrice: 105 })],
        price(100, 100, 99, 0),
        price(106, 106, 100, 60),
    );

    assert.equal(up.state, "open");
});

test("when both bracket legs are touched the stop-loss wins", () => {
    const [next] = applyPriceTick(
        [position({ stopLoss: 95, takeProfit: 105 })],
        price(100, 100, 100, 0),
        price(100, 106, 94, 60),
    );

    assert.equal(next.state, "close");
    assert.equal(next.exitPrice, 95);
});
