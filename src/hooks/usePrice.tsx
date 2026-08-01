import type { Candle } from "@/types/candle";
import type { PriceData } from "@/types/priceData";
import type { UTCTimestamp } from "lightweight-charts";
import { useMemo } from "react";

export function usePrice(candles: Candle[]): PriceData {
    const candle = candles.at(-1);

    const history = useMemo(() => {
        return candles.map(c => ({
            Price: c.close,
            Time: c.time,
            High: c.high,
            Low: c.low,
            Volume: c.volume,
        }));
    }, [candles]);

    return {
        Price: candle?.close ?? 0,
        Time: (candle?.time ?? 0) as UTCTimestamp,
        High: candle?.high ?? 0,
        Low: candle?.low ?? 0,
        Volume: candle?.volume ?? 0,
        History: history,
    };
}
