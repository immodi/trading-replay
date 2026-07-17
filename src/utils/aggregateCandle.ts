import type { Candle } from "@/data/generateCandles";

export function aggregateCandle(current: Candle, next: Candle): Candle {
    const newHigh = Math.max(current.high, next.high);
    const newLow = Math.min(current.low, next.low);

    return {
        ...current,
        high: newHigh,
        highHistory: [...current.highHistory, newHigh],
        low: newLow,
        lowHistory: [...current.lowHistory, newLow],
        close: next.close,
        volume: current.volume + next.volume,
    };
}

