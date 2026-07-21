import type { Candle } from "@/types/candle";
import type { DataRange } from "@/types/dateRange";
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

export async function loadContinuousMnq(date: Date): Promise<Candle[]> {
    const candles = await getData();

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const startTs = start.getTime() / 1000;
    const endTs = end.getTime() / 1000;

    return candles.filter(
        (c) => c.time >= startTs && c.time < endTs,
    );
}

export async function getContinuousMnqRange(): Promise<DataRange> {
    const candles = await getData();

    return {
        start: new Date(Number(candles[0].time) * 1000),
        end: new Date(Number(candles[candles.length - 1].time) * 1000),
    };
}
