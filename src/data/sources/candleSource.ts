import type { Candle, RawCandle } from "@/types/candle";
import type { CandleSourceConfig, CandleSource } from "@/types/candleSource";
import type { DataRange } from "@/types/dateRange";
import {
    normaliseTimeframe,
    resolveBaseTimeframe,
} from "@/constants/assetClass";
import { aggregateCandlesByTimeframe } from "@/utils/candleBucket";
import { normaliseOhlc } from "@/utils/normaliseOhlc";
import { loadJson } from "../opfs";
import { withSourceDefaults } from "./config";

/** Safety cap for daily replay windows (roughly 12 years of trading days). */
const DAILY_REPLAY_WINDOW = 3_000;

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

/** Snap a raw timestamp to its base-resolution bucket start. */
function alignToBaseTimeframe(time: number, baseTimeframeMinutes: number): number {
    if (!Number.isFinite(time)) return time;

    const bucketSeconds = Math.max(1, baseTimeframeMinutes) * 60;
    return Math.floor(time / bucketSeconds) * bucketSeconds;
}

/**
 * Reject malformed ordering before any binary-search range selection or
 * first/last date-range assumptions. This intentionally does not sort.
 */
export function assertChronologicalCandles(candles: Candle[]): void {
    let previousTime: number | null = null;
    let invalidCount = 0;
    const samples: string[] = [];

    for (const candle of candles) {
        const time = candle.time;

        if (
            !Number.isFinite(time) ||
            (previousTime !== null && time <= previousTime)
        ) {
            invalidCount += 1;

            if (samples.length < 5) {
                samples.push(
                    Number.isFinite(time)
                        ? new Date(time * 1000).toISOString()
                        : String(time),
                );
            }
        }

        if (Number.isFinite(time)) previousTime = time;
    }

    if (invalidCount > 0) {
        throw new Error(
            `Candle dataset is not strictly chronological: ${invalidCount} duplicate, non-increasing, or non-finite timestamp(s). First: ${samples.join(", ")}`,
        );
    }
}

/**
 * Fetch (and cache per fileName/resolution) a raw candle JSON file, mapping
 * each row to the app's `Candle` shape.
 */
export async function getData(
    srcFileName: string,
    map: (raw: RawCandle) => Candle = defaultMap,
    cacheKey: string = srcFileName,
): Promise<Candle[]> {
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const json = await loadJson<RawCandle[]>(srcFileName);

    if (json === null) {
        throw new Error(`Candle dataset at ${srcFileName} is missing.`);
    }

    const data = json.map(map);

    assertChronologicalCandles(data);

    cache.set(cacheKey, data);
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

export function createCandleSource(
    configInput: CandleSourceConfig,
): CandleSource {
    const config = withSourceDefaults(configInput);
    const baseTimeframeMinutes = resolveBaseTimeframe(config);
    const cacheKey = `${config.fileName}|${baseTimeframeMinutes}`;

    /**
     * Load the shared dataset. Timestamps are snapped to the source's base
     * bucket (e.g. daily bars move to UTC midnight), which keeps date filters,
     * replay buckets and history consistent even if the import used the
     * exchange's local clock time.
     */
    function loadRaw(): Promise<Candle[]> {
        return getData(
            config.fileName,
            (raw) => {
                const mapped = defaultMap(raw);
                const aligned = {
                    ...mapped,
                    time: alignToBaseTimeframe(
                        raw.time,
                        baseTimeframeMinutes,
                    ) as Candle["time"],
                };

                return config.assetClass === "stock"
                    ? normaliseOhlc(aligned)
                    : aligned;
            },
            cacheKey,
        );
    }

    /** Entire ordered base dataset, backed by the shared loader cache. */
    async function loadAll(): Promise<Candle[]> {
        return loadRaw();
    }

    /** Raw base-timeframe candles for a given UTC date. */
    async function loadDay(date: Date): Promise<Candle[]> {
        const candles = await loadRaw();

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
     * Intraday sources replay one UTC day at a time. Daily sources return the
     * selected day plus the following bars so a replay can play across days.
     */
    async function loadReplayWindow(date: Date): Promise<Candle[]> {
        const candles = await loadRaw();

        if (baseTimeframeMinutes < 1440) {
            const start = utcMidnight(date);
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 1);

            const startTs = start.getTime() / 1000;
            const endTs = end.getTime() / 1000;

            return candles.filter(
                (c) => c.time >= startTs && c.time < endTs
            );
        }

        const startTs = utcMidnight(date).getTime() / 1000;
        const firstIndex = candles.findIndex((c) => c.time >= startTs);

        if (firstIndex < 0) return [];

        return candles.slice(firstIndex, firstIndex + DAILY_REPLAY_WINDOW);
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
        const raw = await loadRaw();
        const resolvedTimeframe = normaliseTimeframe(
            timeframe,
            baseTimeframeMinutes,
        );

        const startTs = utcMidnight(date).getTime() / 1000;

        const firstCandleOfDay = raw.find((c) => c.time >= startTs);
        if (!firstCandleOfDay) return [];

        const candlesBeforeDay = raw.filter((c) => c.time < firstCandleOfDay.time);

        if (resolvedTimeframe === baseTimeframeMinutes) {
            return candlesBeforeDay.slice(-maxCandles);
        }

        // Aggregate raw candles into UTC timestamp buckets. Using buckets
        // (instead of every N rows) keeps bars aligned to real interval
        // boundaries even when the source data contains gaps.
        const aggregated = aggregateCandlesByTimeframe(
            candlesBeforeDay,
            resolvedTimeframe,
        );

        // Keep only the most recent `maxCandles` candles
        return aggregated.length > maxCandles
            ? aggregated.slice(-maxCandles)
            : aggregated;
    }

    /** UTC‑aligned date range covered by the whole dataset. */
    async function getRange(): Promise<DataRange> {
        const candles = await loadRaw();

        if (candles.length === 0) {
            throw new Error(`Candle dataset at ${config.fileName} is empty.`);
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
        assetClass: config.assetClass,
        currency: config.currency,
        pointValue: config.pointValue,
        commission: config.commission ?? 0,
        commissionPercent: config.commissionPercent ?? 0,
        baseTimeframeMinutes,
        loadDay,
        loadReplayWindow,
        loadAll,
        getHistory,
        getRange,
    };
}
