import assert from "node:assert/strict";
import test from "node:test";

import {
    evaluateManualFade,
    FADE_PROFILES,
} from "../src/utils/fadeCheck.ts";

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

test("relaxed profile accepts a 1.0 ATR stop that the base profile rejects", () => {
    const input = {
        side: "short" as const,
        trend: "bearish" as const,
        rangeHigh: 93,
        rangeLow: 90,
        atr: 1,
        boundaryRsi: 68,
        currentRsi: 66.5,
        stopExtreme: 93.25,
        entryPrice: 92.5,
        touchesOk: true,
        failedBreakout: true,
    };

    const base = evaluateManualFade(
        input,
        { ...options, profile: FADE_PROFILES.base },
        true,
    );
    const relaxed = evaluateManualFade(
        input,
        { ...options, profile: FADE_PROFILES.relaxed },
        true,
    );

    assert.equal(base.overall, false);
    assert.equal(relaxed.overall, true);
});
