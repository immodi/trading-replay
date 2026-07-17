import type { UTCTimestamp } from "lightweight-charts";

export interface Candle {
    time: UTCTimestamp;
    open: number;
    high: number;
    highHistory: number[];
    low: number;
    lowHistory: number[];
    close: number;
    volume: number;
}

export function generateCandles(
    count = 200,
    startPrice = 17000,
    startTime = new Date("2021-01-01T09:30:00Z")
): Candle[] {
    const candles: Candle[] = [];

    let currentPrice = startPrice;
    let currentTime = new Date(startTime);

    for (let i = 0; i < count; i++) {
        const open = currentPrice;

        // Random body movement
        const body = (Math.random() - 0.5) * 30;
        const close = open + body;

        // Random wick sizes
        const upperWick = Math.random() * 8;
        const lowerWick = Math.random() * 8;

        const high = Math.max(open, close) + upperWick;
        const low = Math.min(open, close) - lowerWick;

        // Random volume
        const volume = Math.floor(500 + Math.random() * 1500);

        candles.push({
            time: Math.floor(currentTime.getTime() / 1000) as UTCTimestamp,
            open: Number(open.toFixed(2)),
            high: Number(high.toFixed(2)),
            highHistory: [],
            low: Number(low.toFixed(2)),
            lowHistory: [],
            close: Number(close.toFixed(2)),
            volume,
        });

        currentPrice = close;
        currentTime.setMinutes(currentTime.getMinutes() + 1);
    }

    return candles;
}
