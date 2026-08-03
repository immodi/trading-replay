import type { Candle } from "@/types/candle";
import type { DataRange } from "@/types/dateRange";
import { aggregateCandle } from "@/utils/aggregateCandle";
import type { UTCTimestamp } from "lightweight-charts";

interface JsonCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

let cache: Candle[] | null = null;

async function getData(): Promise<Candle[]> {
    if (cache) return cache;

    const response = await fetch("/mnq-1m.json");

    if (!response.ok) {
        throw new Error("Failed to load MNQ data.");
    }

    const json = (await response.json()) as JsonCandle[];

    cache = json.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        highHistory: [],
        low: c.low,
        lowHistory: [],
        close: c.close,
        volume: c.volume,
    }));

    return cache;
}

/**
 * Load raw 1‑minute candles for a given UTC date.
 */
export async function loadContinuousMnq(date: Date): Promise<Candle[]> {
    const candles = await getData();

    // Build UTC midnight for the given date
    const start = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    ));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const startTs = start.getTime() / 1000;
    const endTs = end.getTime() / 1000;

    return candles.filter(
        (c) => c.time >= startTs && c.time < endTs
    );
}

/**
 * Returns aggregated candlestick history from the start of the dataset
 * up to (but not including) the first 1‑minute candle of the given UTC date.
 *
 * @param date - The target date (start of the day, interpreted in UTC)
 * @param timeframe - Number of 1‑minute candles to combine per aggregated candle
 * @returns Promise resolving to an array of aggregated Candle objects
 */
export async function getHistory(
    date: Date,
    timeframe: number
): Promise<Candle[]> {
    const raw = await getData();

    // UTC midnight for the target day
    const targetStart = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    ));
    const startTs = targetStart.getTime() / 1000;

    // Find the first candle of that day (in UTC)
    const firstCandleOfDay = raw.find((c) => c.time >= startTs);
    if (!firstCandleOfDay) {
        return [];
    }

    const cutOffTime = firstCandleOfDay.time;
    const candlesBeforeDay = raw.filter((c) => c.time < cutOffTime);

    if (timeframe === 1) {
        return candlesBeforeDay;
    }

    // Aggregate into timeframe‑minute blocks
    const aggregated: Candle[] = [];
    let current: Candle | null = null;
    let count = 0;

    for (const minute of candlesBeforeDay) {
        if (current === null) {
            current = { ...minute, highHistory: [], lowHistory: [] };
            count = 1;
        } else {
            current = aggregateCandle(current, minute);
            count++;
        }

        if (count === timeframe) {
            aggregated.push(current);
            current = null;
            count = 0;
        }
    }

    if (current !== null) {
        aggregated.push(current);
    }

    return aggregated;
}

/**
 * Returns UTC‑aligned date range of the entire dataset.
 */
export async function getContinuousMnqRange(): Promise<DataRange> {
    const candles = await getData();

    const first = candles[0];
    const last = candles[candles.length - 1];

    // Convert timestamps to UTC midnight for the first and last days
    const startDate = new Date(first.time * 1000);
    const endDate = new Date(last.time * 1000);

    return {
        start: new Date(Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate()
        )),
        end: new Date(Date.UTC(
            endDate.getUTCFullYear(),
            endDate.getUTCMonth(),
            endDate.getUTCDate()
        )),
    };
}
