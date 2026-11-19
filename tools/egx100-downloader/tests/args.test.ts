import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgs } from "../src/args.ts";

test("today mode accepts a day window", () => {
    const options = parseArgs([
        "download",
        "--mode",
        "today",
        "--days",
        "120",
        "--symbols",
        "com-intl-bk",
    ]);

    assert.equal(options.mode, "today");
    assert.equal(options.days, 120);
    assert.deepEqual(options.symbols, ["com-intl-bk"]);
});

test("today mode requires at least one day", () => {
    assert.throws(
        () => parseArgs(["download", "--mode", "today", "--days", "0"]),
        /--days must be at least 1/,
    );
});

test("unknown modes are rejected", () => {
    assert.throws(
        () => parseArgs(["download", "--mode", "later"]),
        /--mode must be full, append, or today/,
    );
});

test("universe accepts an index, JSON, and a known map", () => {
    const options = parseArgs([
        "universe",
        "--index",
        "egx30",
        "--json",
        "--known",
        "known.json",
    ]);

    assert.equal(options.command, "universe");
    assert.equal(options.index, "egx30");
    assert.equal(options.json, true);
    assert.equal(options.knownFile, "known.json");
});

test("universe rejects an unknown index", () => {
    assert.throws(
        () => parseArgs(["universe", "--index", "egx50"]),
        /--index must be egx30 or egx100/,
    );
});
