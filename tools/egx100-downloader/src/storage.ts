import fs from "node:fs";
import path from "node:path";

import type { DailyBar, Manifest, ManifestEntry } from "./types.ts";

export function ensureDirectory(directory: string): void {
    fs.mkdirSync(directory, { recursive: true });
}

export function fileExists(fileName: string): boolean {
    return fs.existsSync(fileName);
}

export function sanitizeTickerForFileName(ticker: string): string {
    return (
        ticker
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "UNKNOWN"
    );
}

export function barFileName(ticker: string): string {
    return `${sanitizeTickerForFileName(ticker)}-1d.json`;
}

export function barDate(time: number): string {
    return new Date(time * 1000).toISOString().slice(0, 10);
}

export function nextUtcDate(date: string): string {
    const [year, month, day] = date.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return next.toISOString().slice(0, 10);
}

export function readJsonFile<T>(fileName: string): T | null {
    if (!fs.existsSync(fileName)) return null;
    return JSON.parse(fs.readFileSync(fileName, "utf8")) as T;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function normaliseBar(value: unknown): DailyBar | null {
    if (typeof value !== "object" || value === null) return null;

    const bar = value as Record<string, unknown>;
    if (
        !isFiniteNumber(bar.time) ||
        !Number.isInteger(bar.time) ||
        !isFiniteNumber(bar.open) ||
        !isFiniteNumber(bar.high) ||
        !isFiniteNumber(bar.low) ||
        !isFiniteNumber(bar.close) ||
        !isFiniteNumber(bar.volume) ||
        bar.open <= 0 ||
        bar.high <= 0 ||
        bar.low <= 0 ||
        bar.close <= 0
    ) {
        return null;
    }

    return {
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
    };
}

export function readBars(fileName: string): DailyBar[] | null {
    const data = readJsonFile<unknown>(fileName);
    if (data === null) return null;

    if (!Array.isArray(data)) {
        throw new Error(`${fileName} is not a JSON array.`);
    }

    const bars: DailyBar[] = [];
    for (const row of data) {
        const bar = normaliseBar(row);
        if (bar === null) {
            throw new Error(`${fileName} contains an invalid OHLCV row.`);
        }
        bars.push(bar);
    }

    return bars.sort((left, right) => left.time - right.time);
}

export function mergeBars(
    existing: DailyBar[],
    incoming: DailyBar[],
): DailyBar[] {
    const byTime = new Map<number, DailyBar>();

    for (const bar of existing) byTime.set(bar.time, bar);
    for (const bar of incoming) byTime.set(bar.time, bar);

    return [...byTime.values()].sort((left, right) => left.time - right.time);
}

export function writeBars(fileName: string, bars: DailyBar[]): void {
    ensureDirectory(path.dirname(fileName));
    const temporary = `${fileName}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(bars));
    fs.renameSync(temporary, fileName);
}

export function readManifest(outputDir: string): Manifest {
    const fileName = path.join(outputDir, "manifest.json");
    const stored = readJsonFile<Partial<Manifest>>(fileName);

    if (
        stored === null ||
        stored.app !== "TradeReplay EGX100 downloader" ||
        !Array.isArray(stored.stocks)
    ) {
        return {
            app: "TradeReplay EGX100 downloader",
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            source:
                "https://www.investing.com/indices/egx-100-ewi-components",
            stocks: [],
        };
    }

    return {
        app: "TradeReplay EGX100 downloader",
        schemaVersion: 1,
        generatedAt: stored.generatedAt ?? new Date().toISOString(),
        source:
            stored.source ??
            "https://www.investing.com/indices/egx-100-ewi-components",
        stocks: stored.stocks as ManifestEntry[],
        ...(stored.lastRun === undefined ? {} : { lastRun: stored.lastRun }),
    };
}

export function writeManifest(outputDir: string, manifest: Manifest): void {
    ensureDirectory(outputDir);
    const fileName = path.join(outputDir, "manifest.json");
    const temporary = `${fileName}.tmp`;

    fs.writeFileSync(
        temporary,
        JSON.stringify(
            {
                ...manifest,
                generatedAt: new Date().toISOString(),
            },
            null,
            2,
        ),
    );
    fs.renameSync(temporary, fileName);
}

export function upsertManifestEntry(
    manifest: Manifest,
    entry: ManifestEntry,
): void {
    const index = manifest.stocks.findIndex(
        (candidate) =>
            candidate.symbol === entry.symbol ||
            candidate.slug === entry.slug ||
            candidate.fileName === entry.fileName,
    );

    if (index >= 0) {
        manifest.stocks[index] = entry;
    } else {
        manifest.stocks.push(entry);
    }

    manifest.stocks.sort((left, right) =>
        left.symbol.localeCompare(right.symbol),
    );
}
