import type { Candle } from "@/types/candle";
import type { PriceData } from "@/types/priceData";
import type { UTCTimestamp } from "lightweight-charts";
import { useEffect, useState } from "react";

export function usePrice(candles: Candle[]): PriceData {
    const [currentPrice, setCurrentPrice] = useState<number>();
    const [currentTime, setCurrentTime] = useState<UTCTimestamp>();

    useEffect(() => {
        if (candles.length === 0) return;

        setCurrentPrice(candles.at(-1).close);
        setCurrentTime(candles.at(-1).time);
    }, [candles])

    return {
        CurrentPrice: currentPrice,
        CurrentTime: currentTime
    };
}
