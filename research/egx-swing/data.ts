import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PortfolioBar } from "../../src/backtesting/portfolio.ts";
import { CONFIG, DATA_DIR } from "./config.ts";

export type Constituent = {
    symbol: string;
    name: string;
    slug: string;
    fileName: string;
};

export type LoadedSymbol = {
    symbol: string;
    name: string;
    bars: PortfolioBar[];
};

type RawBar = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

export function loadConstituents(): Constituent[] {
    const file = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "egx30_constituents.json",
    );
    const payload = JSON.parse(fs.readFileSync(file, "utf8")) as {
        stocks: Constituent[];
    };
    return payload.stocks;
}

export function loadSymbol(entry: Constituent): LoadedSymbol {
    const fileName = path.join(DATA_DIR, entry.fileName);
    const raw = JSON.parse(fs.readFileSync(fileName, "utf8")) as RawBar[];
    const start = CONFIG.startDate
        ? Date.parse(`${CONFIG.startDate}T00:00:00Z`) / 1000
        : Number.NEGATIVE_INFINITY;
    const end = CONFIG.endDate
        ? Date.parse(`${CONFIG.endDate}T23:59:59Z`) / 1000
        : Number.POSITIVE_INFINITY;

    const seen = new Set<number>();
    const bars: PortfolioBar[] = [];

    for (const row of raw) {
        if (
            !Number.isFinite(row.time) ||
            !Number.isFinite(row.open) ||
            !Number.isFinite(row.high) ||
            !Number.isFinite(row.low) ||
            !Number.isFinite(row.close) ||
            row.open <= 0 ||
            row.high <= 0 ||
            row.low <= 0 ||
            row.close <= 0 ||
            row.time < start ||
            row.time > end ||
            seen.has(row.time)
        ) {
            continue;
        }

        seen.add(row.time);
        bars.push({
            symbol: entry.symbol,
            time: row.time,
            open: row.open,
            high: Math.max(row.open, row.high, row.low, row.close),
            low: Math.min(row.open, row.high, row.low, row.close),
            close: row.close,
            volume: Number.isFinite(row.volume) ? row.volume : 0,
        });
    }

    bars.sort((left, right) => left.time - right.time);

    return {
        symbol: entry.symbol,
        name: entry.name,
        bars,
    };
}
