import type { UTCTimestamp } from "lightweight-charts";

export interface Candle {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
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

        // Random movement between -15 and +15 points
        const change = (Math.random() - 0.5) * 30;
        const close = open + change;

        // Random wick sizes
        const high =
            Math.max(open, close) + Math.random() * 10;

        const low =
            Math.min(open, close) - Math.random() * 10;

        candles.push({
            time: Math.floor(currentTime.getTime() / 1000) as UTCTimestamp,
            open: Number(open.toFixed(2)),
            high: Number(high.toFixed(2)),
            low: Number(low.toFixed(2)),
            close: Number(close.toFixed(2)),
        });

        currentPrice = close;

        // Advance 1 minute
        currentTime.setMinutes(currentTime.getMinutes() + 1);
    }

    return candles;
}
