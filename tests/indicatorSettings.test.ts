import assert from "node:assert/strict";
import test from "node:test";

import { normaliseSessionState } from "../src/store/sessionStore.ts";

test("legacy indicator settings become indicator instances", () => {
    const state = normaliseSessionState(
        {
            view: {
                indicatorSettings: {
                    vwap: { enabled: true, color: "#111111" },
                    ema: { enabled: false, color: "#222222", period: 9 },
                    sma: { enabled: true, color: "#333333", period: 50 },
                },
            },
        },
        "MNQ",
    );

    assert.ok(state);
    assert.deepEqual(
        state.view.indicators.map((indicator) => ({
            id: indicator.id,
            type: indicator.type,
            enabled: indicator.enabled,
            color: indicator.color,
            period: indicator.period,
        })),
        [
            {
                id: "vwap",
                type: "vwap",
                enabled: true,
                color: "#111111",
                period: 0,
            },
            {
                id: "ema",
                type: "ema",
                enabled: false,
                color: "#222222",
                period: 9,
            },
            {
                id: "sma",
                type: "sma",
                enabled: true,
                color: "#333333",
                period: 50,
            },
        ],
    );
});

test("multiple indicator instances keep unique ids and discard invalid rows", () => {
    const state = normaliseSessionState(
        {
            view: {
                indicators: [
                    {
                        id: "ema-fast",
                        type: "ema",
                        enabled: true,
                        color: "#ffd93d",
                        period: 9,
                    },
                    {
                        id: "ema-fast",
                        type: "ema",
                        enabled: true,
                        color: "#6bcb77",
                        period: 21,
                    },
                    { id: "broken", type: "bollinger" },
                ],
            },
        },
        "MNQ",
    );

    assert.ok(state);
    assert.deepEqual(
        state.view.indicators.map((indicator) => ({
            id: indicator.id,
            type: indicator.type,
            period: indicator.period,
        })),
        [
            { id: "ema-fast", type: "ema", period: 9 },
            { id: "ema-fast-2", type: "ema", period: 21 },
        ],
    );
});

test("indicator appearance settings are restored", () => {
    const state = normaliseSessionState(
        {
            view: {
                indicators: [
                    {
                        id: "bands",
                        type: "vwap-bands",
                        enabled: true,
                        color: "#123456",
                        lineWidth: 4,
                        lineStyle: "dashed",
                        bandCount: 2,
                    },
                ],
            },
        },
        "MNQ",
    );

    assert.ok(state);
    assert.equal(state.view.indicators[0].type, "vwap-bands");
    assert.equal(state.view.indicators[0].period, 0);
    assert.equal(state.view.indicators[0].lineWidth, 4);
    assert.equal(state.view.indicators[0].lineStyle, "dashed");
    assert.equal(state.view.indicators[0].bandCount, 2);
});

test("invalid indicator appearance settings fall back to defaults", () => {
    const state = normaliseSessionState(
        {
            view: {
                indicators: [
                    {
                        id: "ema",
                        type: "ema",
                        lineWidth: 9,
                        lineStyle: "wavy",
                        bandCount: 9,
                    },
                ],
            },
        },
        "MNQ",
    );

    assert.ok(state);
    assert.equal(state.view.indicators[0].lineWidth, 2);
    assert.equal(state.view.indicators[0].lineStyle, "solid");
    assert.equal(state.view.indicators[0].bandCount, 3);
});

test("a fresh session starts with no indicators", () => {
    const state = normaliseSessionState({}, "MNQ");

    assert.ok(state);
    assert.deepEqual(state.view.indicators, []);
});
