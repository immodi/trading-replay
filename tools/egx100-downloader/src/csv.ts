import { parse } from "csv-parse/sync";

import type { DailyBar } from "./types.ts";

type ColumnMap = {
    date: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

export type DateStyle = "ymd" | "mdy" | "dmy" | "month-name";

export type CsvFormat = {
    kind: "header" | "positional";
    header: string[] | null;
    columns: ColumnMap;
    dateStyle: DateStyle;
    volumeStyle: "suffix" | "number";
};

export type ParsedCsv = {
    bars: DailyBar[];
    skipped: number;
    /** First few malformed rows, for diagnostics. */
    skippedRows: string[];
    format: CsvFormat;
};

const MONTHS: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

function readCsv(text: string): string[][] {
    return parse(text, {
        bom: true,
        delimiter: [",", ";", "\t"],
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
    }) as string[][];
}

function isAsciiLetter(char: string): boolean {
    return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function isDigit(char: string): boolean {
    return char >= "0" && char <= "9";
}

function normaliseHeader(value: string): string {
    let result = "";

    for (const char of value.toLowerCase()) {
        if (isAsciiLetter(char) || isDigit(char)) result += char;
    }

    return result;
}

function headerColumns(row: string[]): ColumnMap | null {
    const headers = row.map(normaliseHeader);

    const indexOf = (...names: string[]): number =>
        headers.findIndex((header) => names.includes(header));

    const date = indexOf("date", "datetime", "timestamp");
    if (date < 0) return null;

    const close = indexOf("price", "close", "closeprice", "last");
    const open = indexOf("open", "openprice");
    const high = indexOf("high", "highprice");
    const low = indexOf("low", "lowprice");
    const volume = indexOf("vol", "volume", "volumeusd");

    if (open < 0 || high < 0 || low < 0 || close < 0) return null;

    return {
        date,
        open,
        high,
        low,
        close,
        volume,
    };
}

function dateParts(value: string): string[] {
    const parts: string[] = [];
    let current = "";

    for (const char of value) {
        if (isDigit(char) || isAsciiLetter(char)) {
            current += char;
        } else if (current !== "") {
            parts.push(current);
            current = "";
        }
    }

    if (current !== "") parts.push(current);
    return parts;
}

function detectDateStyle(value: string): DateStyle {
    const parts = dateParts(value);

    if (parts.some((part) => MONTHS[part.toLowerCase()] !== undefined)) {
        return "month-name";
    }

    const first = parts[0] ?? "";

    if (first.length === 4) return "ymd";

    if (first !== "") {
        const firstNumber = Number(first);
        const secondNumber = Number(parts[1] ?? "");

        if (Number.isFinite(firstNumber) && firstNumber > 12) return "dmy";
        if (Number.isFinite(secondNumber) && secondNumber > 12) return "mdy";
    }

    return "mdy";
}

function makeTimestamp(year: number, month: number, day: number): number | null {
    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        year < 1900 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null;
    }

    const ms = Date.UTC(year, month - 1, day);
    const parsed = new Date(ms);

    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        return null;
    }

    return Math.floor(ms / 1000);
}

function parseTimestamp(value: string, preferred: DateStyle): number | null {
    const timeSeparator = value.indexOf("T");
    const dateOnly =
        timeSeparator > 0 ? value.slice(0, timeSeparator) : value;
    const parts = dateParts(dateOnly);
    if (parts.length < 3) return null;

    const monthNameIndex = parts.findIndex(
        (part) => MONTHS[part.toLowerCase()] !== undefined,
    );

    if (monthNameIndex >= 0) {
        const month = MONTHS[parts[monthNameIndex].toLowerCase()];
        const yearPart = parts.find((part) => part.length === 4);

        if (yearPart === undefined) return null;

        let dayPart: string | undefined;
        for (let index = 0; index < parts.length; index += 1) {
            if (index === monthNameIndex || parts[index] === yearPart) {
                continue;
            }

            const candidate = Number(parts[index]);
            if (candidate >= 1 && candidate <= 31) {
                dayPart = parts[index];
                break;
            }
        }

        if (dayPart === undefined) return null;

        return makeTimestamp(Number(yearPart), month, Number(dayPart));
    }

    const datePartsValue = parts.slice(0, 3);
    const numbers = datePartsValue.map(Number);
    if (numbers.some((number) => !Number.isFinite(number))) return null;

    const style =
        datePartsValue[0].length === 4
            ? "ymd"
            : preferred === "ymd"
              ? "ymd"
              : preferred;

    if (style === "ymd") {
        return makeTimestamp(numbers[0], numbers[1], numbers[2]);
    }

    if (style === "dmy") {
        return makeTimestamp(numbers[2], numbers[1], numbers[0]);
    }

    return makeTimestamp(numbers[2], numbers[0], numbers[1]);
}

function cleanNumber(value: string): string {
    let cleaned = "";

    for (const char of value) {
        if (isDigit(char) || char === "." || char === "+" || char === "-") {
            cleaned += char;
        }
    }

    return cleaned;
}

function toNumber(value: string): number | null {
    const cleaned = cleanNumber(value);
    if (cleaned === "" || cleaned === "+" || cleaned === "-") return null;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function toVolume(value: string, style: "suffix" | "number"): number {
    let trimmed = "";
    for (const char of value) {
        if (char !== " " && char !== "\u00a0" && char !== ",") trimmed += char;
    }

    if (trimmed === "" || trimmed === "-") return 0;

    if (style === "suffix") {
        const upper = trimmed.toUpperCase();
        const last = upper.slice(-1);
        const multiplier =
            last === "K"
                ? 1e3
                : last === "M"
                  ? 1e6
                  : last === "B"
                    ? 1e9
                    : last === "T"
                      ? 1e12
                      : 1;

        const base = multiplier === 1 ? upper : upper.slice(0, -1);
        const amount = toNumber(base);
        return amount === null ? 0 : Math.round(amount * multiplier);
    }

    const amount = toNumber(trimmed);
    return amount === null ? 0 : Math.round(amount);
}

function detectVolumeStyle(value: string): "suffix" | "number" {
    const trimmed = value.trim().toUpperCase();
    const last = trimmed.slice(-1);
    return last === "K" || last === "M" || last === "B" || last === "T"
        ? "suffix"
        : "number";
}

function pickDateSample(rows: string[][], dateColumn: number): string {
    for (const row of rows) {
        const value = row[dateColumn];
        if (value !== undefined && value.trim() !== "") return value;
    }

    return "";
}

/**
 * Parse an Investing.com historical-data CSV.
 *
 * Format detection is explicit: header names determine the column map, and
 * the first date/volume values determine date ordering and volume notation.
 * The returned `format` can be logged or stored for auditing.
 */
export function parseDailyCsv(text: string): ParsedCsv {
    const rows = readCsv(text);

    if (rows.length === 0) {
        throw new Error("CSV file has no rows.");
    }

    const header = headerColumns(rows[0]);
    const columns: ColumnMap =
        header ??
        ({
            date: 0,
            close: 1,
            open: 2,
            high: 3,
            low: 4,
            volume: 5,
        } satisfies ColumnMap);

    const dataRows = header ? rows.slice(1) : rows;
    const dateStyle = detectDateStyle(
        pickDateSample(dataRows, columns.date),
    );
    const volumeStyle =
        columns.volume >= 0
            ? detectVolumeStyle(
                  dataRows.find(
                      (row) => (row[columns.volume] ?? "").trim() !== "",
                  )?.[columns.volume] ?? "",
              )
            : "number";

    const format: CsvFormat = {
        kind: header ? "header" : "positional",
        header: header ? rows[0] : null,
        columns,
        dateStyle,
        volumeStyle,
    };

    const byTime = new Map<number, DailyBar>();
    let skipped = 0;
    const skippedRows: string[] = [];

    const skipRow = (row: string[]) => {
        skipped += 1;
        if (skippedRows.length < 5) {
            skippedRows.push(row.join(" | "));
        }
    };

    for (const row of dataRows) {
        if (row.length < 5) {
            skipRow(row);
            continue;
        }

        const dateValue = row[columns.date] ?? "";
        const time = parseTimestamp(dateValue, dateStyle);
        const open = toNumber(row[columns.open] ?? "");
        const high = toNumber(row[columns.high] ?? "");
        const low = toNumber(row[columns.low] ?? "");
        const close = toNumber(row[columns.close] ?? "");
        const volume =
            columns.volume >= 0
                ? toVolume(row[columns.volume] ?? "", volumeStyle)
                : 0;

        if (
            time === null ||
            open === null ||
            high === null ||
            low === null ||
            close === null ||
            open <= 0 ||
            high <= 0 ||
            low <= 0 ||
            close <= 0
        ) {
            skipRow(row);
            continue;
        }

        byTime.set(time, {
            time,
            open,
            // Keep the candle internally consistent even when Investing.com
            // reports open/close a cent outside the high/low range.
            high: Math.max(open, high, low, close),
            low: Math.min(open, high, low, close),
            close,
            volume,
        });
    }

    const bars = [...byTime.values()].sort((left, right) => left.time - right.time);

    if (bars.length === 0) {
        throw new Error(
            `CSV did not contain any valid OHLC rows (first row: ${rows[0].join(" | ")}).`,
        );
    }

    return { bars, skipped, skippedRows, format };
}
