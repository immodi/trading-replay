import type { Candle } from "@/data/generateCandles";

export function reaggregateCandle(previous: Candle, current: Candle): Candle {
    return {
        ...previous,
        high: Math.max(previous.high, current.high),
        low: Math.min(previous.low, current.low),
        close: current.close,
        volume: previous.volume + current.volume,
    };
}
