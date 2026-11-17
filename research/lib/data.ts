/**
 * Research data access: compact binary cache -> engine bar arrays.
 * Uses the app's own aggregation path (aggregatePackedBars), so timeframe
 * buckets and partial-bar handling are identical to the browser engine.
 */
import fs from "node:fs";
import path from "node:path";
import { aggregatePackedBars } from "../../src/backtesting/aggregateBars.ts";
import type { BacktestBar } from "../../src/backtesting/types.ts";

export interface InstrumentSpec {
    id: string;
    symbol: string;
    pointValue: number;
    tickSize: number;
    commissionPerSide: number;
    first: string;
}

export const INSTRUMENTS: Record<string, InstrumentSpec> = {
    mes: { id: "mes", symbol: "MES", pointValue: 5, tickSize: 0.25, commissionPerSide: 1.25, first: "2019-05-06" },
    mnq: { id: "mnq", symbol: "MNQ", pointValue: 2, tickSize: 0.25, commissionPerSide: 1.25, first: "2021-07-12" },
    m2k: { id: "m2k", symbol: "M2K", pointValue: 5, tickSize: 0.1, commissionPerSide: 1.25, first: "2019-05-06" },
    mym: { id: "mym", symbol: "MYM", pointValue: 0.5, tickSize: 1, commissionPerSide: 1.25, first: "2019-05-06" },
    mgc: { id: "mgc", symbol: "MGC", pointValue: 10, tickSize: 0.1, commissionPerSide: 1.5, first: "2019-06-03" },
    mcl: { id: "mcl", symbol: "MCL", pointValue: 100, tickSize: 0.01, commissionPerSide: 1.5, first: "2021-07-12" },
};

const CACHE = path.resolve(import.meta.dirname, "..", "cache");

interface BinaryData {
    count: number;
    time: Uint32Array;
    values: Float32Array;
}

export function loadBinary(symbol: string): BinaryData {
    const buf = fs.readFileSync(path.join(CACHE, `${symbol}.bin`));
    if (buf.toString("ascii", 0, 8) !== "TRBARS1\n") {
        throw new Error(`Bad cache file for ${symbol}`);
    }
    const count = buf.readUInt32LE(8);
    return {
        count,
        time: new Uint32Array(buf.buffer, buf.byteOffset + 12, count),
        values: new Float32Array(buf.buffer, buf.byteOffset + 12 + count * 4, count * 5),
    };
}

/** Aggregate 1m cache into BacktestBar[] at the given timeframe. */
export function barsFor(symbol: string, timeframeMinutes: number): BacktestBar[] {
    const data = loadBinary(symbol);
    const packed = new Float64Array(data.count * 6);
    for (let i = 0; i < data.count; i++) {
        const o = i * 6;
        packed[o] = data.time[i];
        packed[o + 1] = data.values[i * 5];
        packed[o + 2] = data.values[i * 5 + 1];
        packed[o + 3] = data.values[i * 5 + 2];
        packed[o + 4] = data.values[i * 5 + 3];
        packed[o + 5] = data.values[i * 5 + 4];
    }
    const result = aggregatePackedBars(packed, timeframeMinutes, false);
    return result.bars;
}

export function barIndexBefore(bars: BacktestBar[], dateIso: string): number {
    const ts = Math.floor(Date.parse(`${dateIso}T00:00:00Z`) / 1000);
    let lo = 0;
    let hi = bars.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (bars[mid].time < ts) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

export interface RangeSelection {
    bars: BacktestBar[];
    startTs: number;
    endTsExclusive: number;
}

export function rangeBars(
    bars: BacktestBar[],
    startDate: string,
    endDateInclusive: string,
    warmupBars = 5000,
): RangeSelection {
    const startTs = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
    const endTsExclusive = Math.floor(Date.parse(`${endDateInclusive}T00:00:00Z`) / 1000) + 86400;
    // Keep the requested warm-up bars plus a small buffer ahead of the range.
    const firstInRange = barIndexBefore(bars, startDate);
    const from = Math.max(0, firstInRange - Math.max(warmupBars + 5, 10));
    const to = Math.min(bars.length, barIndexBefore(bars, addDays(endDateInclusive, 1)));
    return { bars: bars.slice(from, to), startTs, endTsExclusive };
}

export function addDays(dateIso: string, days: number): string {
    const ts = Date.parse(`${dateIso}T00:00:00Z`) + days * 86400_000;
    return new Date(ts).toISOString().slice(0, 10);
}
