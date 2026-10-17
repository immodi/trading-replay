import type { Candle, RawCandle } from "@/types/candle";
import type { CandleSourceConfig, CandleSource } from "@/types/candleSource";
import type { DataRange } from "@/types/dateRange";
import { aggregateCandle } from "@/utils/aggregateCandle";

/**
 * Resolution of the stored dataset. Raw JSON holds 1‑minute bars; larger
 * timeframes are aggregated on demand.
 */
const BASE_TIMEFRAME = 1;

const cache = new Map<string, Candle[]>();

const defaultMap = (raw: RawCandle): Candle => ({
    time: raw.time,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    volume: raw.volume,
    highHistory: [],
    lowHistory: [],
});

/**
 * Fetch (and cache per URL) a raw candle JSON file, mapping each row to
 * the app's `Candle` shape.
 */
export async function getData(
    url: string,
    map: (raw: RawCandle) => Candle = defaultMap,
): Promise<Candle[]> {
    const hit = cache.get(url);
    if (hit) return hit;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to load data from ${url}.`);
    }

    const json = (await response.json()) as RawCandle[];
    const data = json.map(map);

    cache.set(url, data);
    return data;
}

/** UTC midnight of the day the given instant falls in. */
function utcMidnight(date: Date): Date {
    return new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    ));
}

export function createCandleSource(config: CandleSourceConfig): CandleSource {
    /** Raw 1‑minute candles for a given UTC date. */
    async function loadDay(date: Date): Promise<Candle[]> {
        const candles = await getData(config.url);

        const start = utcMidnight(date);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 1);

        const startTs = start.getTime() / 1000;
        const endTs = end.getTime() / 1000;

        return candles.filter(
            (c) => c.time >= startTs && c.time < endTs
        );
    }

    /**
     * Candles aggregated to `timeframe` minutes, from the start of the
     * dataset up to (but not including) the first candle of the given date.
     */
    async function getHistory(
        date: Date,
        timeframe: number,
        maxCandles: number = 200
    ): Promise<Candle[]> {
        const raw = await getData(config.url);

        const startTs = utcMidnight(date).getTime() / 1000;

        const firstCandleOfDay = raw.find((c) => c.time >= startTs);
        if (!firstCandleOfDay) return [];

        const candlesBeforeDay = raw.filter((c) => c.time < firstCandleOfDay.time);

        if (timeframe === BASE_TIMEFRAME) {
            return candlesBeforeDay.slice(-maxCandles);
        }

        // Aggregate raw candles into `timeframe`‑minute blocks
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

        // Keep only the most recent `maxCandles` candles
        return aggregated.length > maxCandles
            ? aggregated.slice(-maxCandles)
            : aggregated;
    }

    /** UTC‑aligned date range covered by the whole dataset. */
    async function getRange(): Promise<DataRange> {
        const candles = await getData(config.url);

        if (candles.length === 0) {
            throw new Error(`Candle dataset at ${config.url} is empty.`);
        }

        const first = candles[0];
        const last = candles[candles.length - 1];

        return {
            start: utcMidnight(new Date(first.time * 1000)),
            end: utcMidnight(new Date(last.time * 1000)),
        };
    }

    return {
        id: config.id,
        symbol: config.symbol,
        pointValue: config.pointValue,
        loadDay,
        getHistory,
        getRange,
    };
}
