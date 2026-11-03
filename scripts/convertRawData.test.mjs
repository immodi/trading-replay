import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    contractExpiryKey,
    convertCsvToJson,
    planActiveContracts,
} from "./convertRawData.mjs";

function volumes(entries) {
    const bySymbol = new Map();

    for (const [symbol, date, volume] of entries) {
        if (!bySymbol.has(symbol)) {
            bySymbol.set(symbol, new Map());
        }

        bySymbol.get(symbol).set(date, volume);
    }

    return bySymbol;
}

test("contract expiry keys sort by month and inferred year", () => {
    assert.ok(
        contractExpiryKey("MNQU1", "2021-07-11") <
            contractExpiryKey("MNQZ1", "2021-07-11"),
    );
    assert.ok(
        contractExpiryKey("MNQZ1", "2021-07-11") <
            contractExpiryKey("MNQH2", "2021-07-11"),
    );
});

test("roll policy never moves back to an older expiry", () => {
    const contracts = ["MNQU1", "MNQZ1"];

    const active = planActiveContracts({
        contracts,
        dailyVolumes: volumes([
            ["MNQU1", "2021-09-08", 100],
            ["MNQZ1", "2021-09-08", 10],
            ["MNQU1", "2021-09-09", 100],
            ["MNQZ1", "2021-09-09", 200],
            ["MNQU1", "2021-09-10", 300],
            ["MNQZ1", "2021-09-10", 100],
        ]),
        dates: new Set(["2021-09-08", "2021-09-09", "2021-09-10"]),
    });

    assert.equal(active.get("2021-09-08"), "MNQU1");
    assert.equal(active.get("2021-09-09"), "MNQZ1");
    assert.equal(active.get("2021-09-10"), "MNQZ1");
});

test("converter keeps one outright contract per day and ignores spreads", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tradereplay-"));
    const input = path.join(directory, "fixture.csv");
    const output = path.join(directory, "out.json");

    const rows = [
        "ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol",
        // Overlapping outrights whose per-minute volume leadership alternates.
        "2021-09-08T22:00:00.000000000Z,33,1,1,15000,15010,14990,15005,100,MNQU1",
        "2021-09-08T22:00:00.000000000Z,33,1,2,15100,15110,15090,15105,10,MNQZ1",
        "2021-09-08T22:00:00.000000000Z,33,1,3,1,2,0.5,1.5,9999,MNQU1-MNQZ1",
        "2021-09-08T22:01:00.000000000Z,33,1,1,15005,15015,15000,15010,10,MNQU1",
        "2021-09-08T22:01:00.000000000Z,33,1,2,15105,15120,15100,15115,100,MNQZ1",
        "2021-09-08T22:01:00.000000000Z,33,1,3,1.5,3,0.25,2.5,9999,MNQU1-MNQZ1",
        "2021-09-08T22:02:00.000000000Z,33,1,1,15010,15020,15005,15015,100,MNQU1",
        "2021-09-08T22:02:00.000000000Z,33,1,2,15115,15125,15110,15120,10,MNQZ1",
        "2021-09-08T22:02:00.000000000Z,33,1,3,2.5,4,1,3.5,9999,MNQU1-MNQZ1",
    ];

    fs.writeFileSync(input, rows.join("\n"));

    await convertCsvToJson({ input, output, log: () => {} });

    const candles = JSON.parse(fs.readFileSync(output, "utf8"));

    assert.equal(candles.length, 3);
    assert.deepEqual(
        candles.map((candle) => candle.close),
        [15005, 15010, 15015],
    );
});
