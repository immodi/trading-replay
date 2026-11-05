import assert from "node:assert/strict";
import test from "node:test";

import { normaliseSessionState } from "../src/store/sessionStore.ts";

test("chart timezone defaults to New York and accepts supported zones", () => {
    const fallback = normaliseSessionState({}, "MES");
    assert.ok(fallback);
    assert.equal(fallback.view.chartTimezone, "America/New_York");

    const london = normaliseSessionState(
        { view: { chartTimezone: "Europe/London" } },
        "MES",
    );
    assert.ok(london);
    assert.equal(london.view.chartTimezone, "Europe/London");

    const invalid = normaliseSessionState(
        { view: { chartTimezone: "Mars/Olympus" } },
        "MES",
    );
    assert.ok(invalid);
    assert.equal(invalid.view.chartTimezone, "America/New_York");
});

test("strategy panel visibility is persisted per session", () => {
    const fallback = normaliseSessionState({}, "MES");
    assert.ok(fallback);
    assert.equal(fallback.view.activeStrategyPanel, "fade");

    const hidden = normaliseSessionState(
        { view: { activeStrategyPanel: null } },
        "MES",
    );
    assert.ok(hidden);
    assert.equal(hidden.view.activeStrategyPanel, null);
});
