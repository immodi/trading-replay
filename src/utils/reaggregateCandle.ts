import type { Candle } from "@/types/candle";

export function reaggregateCandle(
    remainingLastSourceCandle: Candle,
    currentAggregatedCandle: Candle,
    sourceCandleBeingRemoved: Candle,
    minuteInCandle: number
): Candle {
    return {
        ...currentAggregatedCandle,
        open: currentAggregatedCandle.open,
        high: currentAggregatedCandle.highHistory[minuteInCandle],
        low: currentAggregatedCandle.lowHistory[minuteInCandle],
        highHistory: currentAggregatedCandle.highHistory.slice(0, -1),
        lowHistory: currentAggregatedCandle.lowHistory.slice(0, -1),
        close: remainingLastSourceCandle.close,
        volume: currentAggregatedCandle.volume - sourceCandleBeingRemoved.volume,
    };
}
