import type { Candle } from "@/data/generateCandles";

export default function getCandleWindow(
    source: Candle[],
    windowIndex: number,
    timeframeMin: number
): Candle[] {
    const start = windowIndex * timeframeMin;
    const end = start + timeframeMin;

    return source.slice(start, end);
}
