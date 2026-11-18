import assert from "node:assert/strict";
import test from "node:test";

import { parseDailyCsv } from "../src/csv.ts";
import {
    barDate,
    barFileName,
    mergeBars,
    nextUtcDate,
    sanitizeTickerForFileName,
} from "../src/storage.ts";
import type { DailyBar } from "../src/types.ts";

test("parses Investing.com CSV with header and abbreviated volume", () => {
    const parsed = parseDailyCsv(
        [
            '"Date","Price","Open","High","Low","Vol.","Change %"',
            '"11/17/2026","6.250","6.200","6.350","6.150","82.09M","+1.13%"',
            '"11/16/2026","6.180","6.340","6.350","6.110","1,234,567","-2.37%"',
        ].join("\n"),
    );

    assert.equal(parsed.skipped, 0);
    assert.equal(parsed.bars.length, 2);
    assert.deepEqual(parsed.bars[0], {
        time: Date.UTC(2026, 10, 16) / 1000,
        open: 6.34,
        high: 6.35,
        low: 6.11,
        close: 6.18,
        volume: 1_234_567,
    });
    assert.equal(parsed.bars[1].volume, 82_090_000);
});

test("parses semicolon CSV and ISO dates without a header", () => {
    const parsed = parseDailyCsv(
        [
            "2026-11-17;10.5;10;11;9.5;2.5K",
            "2026-11-16;10;9.5;10.5;9;1.2M",
        ].join("\n"),
    );

    assert.equal(parsed.bars.length, 2);
    assert.equal(parsed.bars[0].volume, 1_200_000);
    assert.equal(parsed.bars[1].volume, 2_500);
    assert.equal(parsed.format.kind, "positional");
    assert.equal(parsed.format.dateStyle, "ymd");
    assert.equal(parsed.format.volumeStyle, "suffix");
});

test("detects month-name dates and ISO timestamps", () => {
    const monthNames = parseDailyCsv(
        [
            "Date,Price,Open,High,Low,Vol.",
            '"Nov 17, 2026","6.25","6.20","6.35","6.15","100"',
            '"16 Nov 2026","6.18","6.34","6.35","6.11","200"',
        ].join("\n"),
    );

    assert.equal(monthNames.format.dateStyle, "month-name");
    assert.equal(monthNames.bars.length, 2);

    const timestamps = parseDailyCsv(
        [
            "Date,Price,Open,High,Low,Vol.",
            "2026-11-17T00:00:00Z,6.25,6.20,6.35,6.15,100",
        ].join("\n"),
    );

    assert.equal(timestamps.format.dateStyle, "ymd");
    assert.equal(timestamps.bars[0].time, Date.UTC(2026, 10, 17) / 1000);
});

test("detects day-first dates when the first component is over 12", () => {
    const parsed = parseDailyCsv(
        [
            "Date,Price,Open,High,Low,Vol.",
            "17/11/2026,6.25,6.20,6.35,6.15,100",
        ].join("\n"),
    );

    assert.equal(parsed.format.dateStyle, "dmy");
    assert.equal(parsed.bars[0].time, Date.UTC(2026, 10, 17) / 1000);
});

test("expands high/low so open and close stay inside the candle", () => {
    const parsed = parseDailyCsv(
        [
            "Date,Price,Open,High,Low,Vol.",
            "02/08/2024,37.01,36.89,37.79,36.95,100",
            "02/07/2024,41.58,39.71,42.42,40.06,100",
        ].join("\n"),
    );

    for (const bar of parsed.bars) {
        assert.ok(bar.high >= Math.max(bar.open, bar.close));
        assert.ok(bar.low <= Math.min(bar.open, bar.close));
    }
});

test("skips malformed rows but keeps valid dates", () => {
    const parsed = parseDailyCsv(
        [
            "Date,Price,Open,High,Low,Vol.",
            "11/17/2026,6.25,6.20,6.35,6.15,100",
            "bad-date,6.25,6.20,6.35,6.15,100",
            "11/15/2026,6.25,6.20,6.35,,100",
        ].join("\n"),
    );

    assert.equal(parsed.bars.length, 1);
    assert.equal(parsed.skipped, 2);
    assert.equal(parsed.skippedRows.length, 2);
});

test("merge keeps incoming duplicate dates and sorts ascending", () => {
    const existing: DailyBar[] = [
        { time: 300, open: 1, high: 1, low: 1, close: 1, volume: 1 },
        { time: 100, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ];
    const incoming: DailyBar[] = [
        { time: 300, open: 2, high: 2, low: 2, close: 2, volume: 2 },
        { time: 200, open: 3, high: 3, low: 3, close: 3, volume: 3 },
    ];

    assert.deepEqual(
        mergeBars(existing, incoming).map((bar) => [bar.time, bar.close]),
        [
            [100, 1],
            [200, 3],
            [300, 2],
        ],
    );
});

test("date and file-name helpers are stable", () => {
    assert.equal(barDate(0), "1970-01-01");
    assert.equal(nextUtcDate("2026-12-31"), "2027-01-01");
    assert.equal(sanitizeTickerForFileName("comi.ca"), "COMI-CA");
    assert.equal(barFileName("ccap"), "CCAP-1d.json");
});
