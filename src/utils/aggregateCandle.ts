import type { Candle } from "@/data/generateCandles";

export function aggregateCandle(current: Candle, next: Candle): Candle {
    return {
        ...current,
        high: Math.max(current.high, next.high),
        low: Math.min(current.low, next.low),
        close: next.close,
        volume: current.volume + next.volume,
    };
}

