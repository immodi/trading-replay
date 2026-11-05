import assert from "node:assert/strict";
import test from "node:test";

import { evaluateManualFade } from "../src/utils/fadeCheck.ts";

const options = {
    pointValue: 5,
    riskBudget: 800,
    maxContracts: 20,
    commissionRoundTrip: 2.5,
};

test("manual fade check passes a complete short setup", () => {
    const result = evaluateManualFade(
        {
            side: "short",
            trend: "bearish",
            rangeHigh: 100,
            rangeLow: 90,
            atr: 4,
            boundaryRsi: 68,
            currentRsi: 66.5,
            stopExtreme: 100.5,
            entryPrice: 99.5,
            touchesOk: true,
            failedBreakout: true,
        },
        options,
        true,
    );

    assert.equal(result.overall, true);
    assert.equal(result.widthAtr, 2.5);
    assert.equal(result.divergence, 1.5);
    assert.equal(result.stopAtr, 0.3125);
    assert.equal(result.contracts, 20);
});

test("manual fade check fails when the stop is too wide or RSI divergence is absent", () => {
    const result = evaluateManualFade(
        {
            side: "short",
            trend: "bearish",
            rangeHigh: 100,
            rangeLow: 90,
            atr: 1,
            boundaryRsi: 60,
            currentRsi: 59.7,
            stopExtreme: 101.5,
            entryPrice: 99.5,
            touchesOk: true,
            failedBreakout: true,
        },
        options,
        true,
    );

    assert.equal(result.overall, false);
    assert.ok(result.stopAtr !== null && result.stopAtr > 0.8);
    assert.ok(result.divergence !== null && result.divergence <= 0.5);
});
