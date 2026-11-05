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
