import assert from "node:assert/strict";
import test from "node:test";

import {
    defaultParameterValues,
    validateMetadata,
    validateParameterValues,
} from "../src/backtesting/validateStrategy.ts";

test("metadata defaults are normalized", () => {
    const metadata = validateMetadata({
        apiVersion: 1,
        id: "test",
        name: "Test",
        version: "1.0.0",
        parameters: [
            {
                key: "period",
                label: "Period",
                type: "number",
                default: 20,
                min: 2,
                max: 100,
                step: 1,
            },
            {
                key: "enabled",
                type: "boolean",
                default: true,
            },
        ],
    });

    assert.equal(metadata.warmupBars, 0);
    assert.equal(metadata.maxLookbackBars, 500);
    assert.deepEqual(defaultParameterValues(metadata), {
        period: 20,
        enabled: true,
    });
});

test("invalid metadata is rejected", () => {
    assert.throws(
        () =>
            validateMetadata({
                apiVersion: 2,
                id: "test",
                name: "Test",
                version: "1.0.0",
                parameters: [],
            }),
        /apiVersion/,
    );

    assert.throws(
        () =>
            validateMetadata({
                apiVersion: 1,
                id: "test",
                name: "Test",
                version: "1.0.0",
                parameters: [
                    {
                        key: "period",
                        type: "number",
                        default: 200,
                        min: 2,
                        max: 100,
                    },
                ],
            }),
        /outside its min\/max/,
    );
});

test("parameter values are checked against metadata", () => {
    const metadata = validateMetadata({
        apiVersion: 1,
        id: "test",
        name: "Test",
        version: "1.0.0",
        parameters: [
            {
                key: "period",
                type: "number",
                default: 20,
                min: 2,
                max: 100,
            },
            {
                key: "mode",
                type: "string",
                default: "a",
            },
        ],
    });

    assert.deepEqual(
        validateParameterValues(metadata, { period: 30, mode: "b" }),
        { period: 30, mode: "b" },
    );

    assert.throws(
        () => validateParameterValues(metadata, { period: 1, mode: "b" }),
        /at least 2/,
    );

    assert.throws(
        () => validateParameterValues(metadata, { period: 30, mode: 1 }),
        /must be a string/,
    );
});

test("advanced parameter flags are normalized", () => {
    const metadata = validateMetadata({
        apiVersion: 1,
        id: "test",
        name: "Test",
        version: "1.0.0",
        parameters: [
            {
                key: "basic",
                type: "number",
                default: 1,
            },
            {
                key: "advanced",
                type: "number",
                default: 2,
                advanced: true,
            },
        ],
    });

    assert.equal(metadata.parameters[0].advanced, undefined);
    assert.equal(metadata.parameters[1].advanced, true);

    assert.throws(
        () =>
            validateMetadata({
                apiVersion: 1,
                id: "test",
                name: "Test",
                version: "1.0.0",
                parameters: [
                    {
                        key: "bad",
                        type: "number",
                        default: 1,
                        advanced: "yes",
                    },
                ],
            }),
        /advanced must be a boolean/,
    );
});
