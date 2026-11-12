import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    contractExpiryKey,
    convertCsvToJson,
    parseOutrightSymbol,
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

test("outright parsing is scoped to the requested instrument root", () => {
    assert.deepEqual(parseOutrightSymbol("MESH0", "MES"), {
        month: 3,
        yearDigit: 0,
    });
    assert.equal(parseOutrightSymbol("MNQH0", "MES"), null);
    assert.equal(parseOutrightSymbol("MESH0-MESM0", "MES"), null);
    assert.ok(
        contractExpiryKey("MESH0", "2019-05-05", "MES") <
            contractExpiryKey("MESM0", "2019-05-05", "MES"),
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

test("converter merges chronological CSV windows", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tradereplay-"));
    const first = path.join(directory, "first.csv");
    const second = path.join(directory, "second.csv");
    const output = path.join(directory, "out.json");
    const header =
        "ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol";

    fs.writeFileSync(
        first,
        [
            header,
            "2021-09-08T22:00:00.000000000Z,33,1,1,15000,15010,14990,15005,100,MNQU1",
            "2021-09-08T22:01:00.000000000Z,33,1,1,15005,15015,15000,15010,100,MNQU1",
        ].join("\n"),
    );
    fs.writeFileSync(
        second,
        [
            header,
            "2021-09-08T22:02:00.000000000Z,33,1,1,15010,15020,15005,15015,100,MNQU1",
        ].join("\n"),
    );

    await convertCsvToJson({
        inputs: [first, second],
        output,
        log: () => {},
    });

    const candles = JSON.parse(fs.readFileSync(output, "utf8"));

    assert.equal(candles.length, 3);
    assert.deepEqual(
        candles.map((candle) => candle.close),
        [15005, 15010, 15015],
    );
    assert.ok(candles[0].time < candles[1].time);
    assert.ok(candles[1].time < candles[2].time);
});

test("converter distinguishes repeated contract symbols across decades", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tradereplay-"));
    const input = path.join(directory, "fixture.csv");
    const output = path.join(directory, "out.json");

    fs.writeFileSync(
        input,
        [
            "ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol",
            "2011-01-03T23:00:00.000000000Z,33,1,1,1400,1400,1400,1400,100,MGCZ1",
            "2011-01-04T23:00:00.000000000Z,33,1,1,1401,1401,1401,1401,100,MGCZ1",
            "2012-01-03T23:00:00.000000000Z,33,1,2,1500,1500,1500,1500,100,MGCZ2",
            "2012-01-04T23:00:00.000000000Z,33,1,2,1501,1501,1501,1501,100,MGCZ2",
            // Same symbols as above, but ten years later and with new ids.
            "2021-01-04T23:00:00.000000000Z,33,1,3,1900,1900,1900,1900,200,MGCZ1",
            "2021-01-05T23:00:00.000000000Z,33,1,3,1901,1901,1901,1901,200,MGCZ1",
            "2022-01-04T23:00:00.000000000Z,33,1,4,1800,1800,1800,1800,300,MGCZ2",
            "2022-01-05T23:00:00.000000000Z,33,1,4,1801,1801,1801,1801,300,MGCZ2",
        ].join("\n"),
    );

    await convertCsvToJson({
        input,
        symbol: "MGC",
        output,
        log: () => {},
    });

    const candles = JSON.parse(fs.readFileSync(output, "utf8"));

    assert.equal(candles.length, 8);
    assert.deepEqual(
        candles.map((candle) => candle.close),
        [1400, 1401, 1500, 1501, 1900, 1901, 1800, 1801],
    );
});

test("converter only includes the requested instrument root", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tradereplay-"));
    const input = path.join(directory, "fixture.csv");
    const output = path.join(directory, "out.json");

    fs.writeFileSync(
        input,
        [
            "ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol",
            "2019-05-05T22:00:00.000000000Z,33,1,1,2925,2927,2925,2926,100,MESH0",
            "2019-05-05T22:00:00.000000000Z,33,1,2,15000,15010,14990,15005,100,MNQZ1",
            "2019-05-05T22:00:00.000000000Z,33,1,3,1,2,0.5,1.5,9999,MESH0-MESM0",
        ].join("\n"),
    );

    await convertCsvToJson({
        inputs: [input],
        symbol: "MES",
        output,
        log: () => {},
    });

    const candles = JSON.parse(fs.readFileSync(output, "utf8"));

    assert.equal(candles.length, 1);
    assert.equal(candles[0].close, 2926);
});
