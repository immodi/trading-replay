import type { Candle } from "@/types/candle";
import type { PriceData } from "@/types/priceData";
import type { UTCTimestamp } from "lightweight-charts";
import { useEffect, useState } from "react";

export function usePrice(candles: Candle[]): PriceData {
    const [currentPrice, setCurrentPrice] = useState<number>();
    const [currentTime, setCurrentTime] = useState<UTCTimestamp>();
    const [currentHigh, setCurrentHigh] = useState<number>();
    const [currentLow, setCurrentLow] = useState<number>();

    useEffect(() => {
        if (candles.length === 0) return;

        setCurrentPrice(candles.at(-1).close);
        setCurrentTime(candles.at(-1).time);
        setCurrentHigh(candles.at(-1).high);
        setCurrentLow(candles.at(-1).low);
    }, [candles])

    return {
        Price: currentPrice,
        Time: currentTime,
        High: currentHigh,
        Low: currentLow
    };
}
