import type { Candle } from "@/types/candle";
import type { PriceData } from "@/types/priceData";
import type { UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

export function usePrice(candles: Candle[]): PriceData {
    const history = useRef<PriceData[]>([]);

    useEffect(() => {
        const candle = candles.at(-1);
        if (!candle) return;

        history.current.push({
            Price: candle.close,
            Time: candle.time,
            High: candle.high,
            Low: candle.low,
            Volume: candle.volume,
        });
    }, [candles]);

    const candle = candles.at(-1);

    return {
        Price: candle?.close ?? 0,
        Time: candle?.time ?? 0 as UTCTimestamp,
        High: candle?.high ?? 0,
        Low: candle?.low ?? 0,
        Volume: candle?.volume ?? 0,
        History: history.current,
    };
}
