import { useEffect, useMemo, useRef, useState } from "react";

import { generateCandles, type Candle } from "@/data/generateCandles";
import { aggregateCandle } from "@/utils/aggregateCandle";
import getCandleWindow from "@/utils/getCandleWindow";

const candleData = generateCandles(100 * 60);

interface ReplayState {
    windowIndex: number;
}

export function useReplay(timerMin: number) {
    // Engine state (does not trigger renders)
    const replay = useRef<ReplayState>({
        windowIndex: 0,
    });

    // UI state
    const [candles, setCandles] = useState<Candle[]>([]);

    const volume = useMemo(
        () =>
            candles.map(candle => ({
                time: candle.time,
                value: candle.volume,
                color:
                    candle.close >= candle.open
                        ? "#26a69a"
                        : "#ef5350",
            })),
        [candles]
    );

    useEffect(() => {
        const id = setInterval(() => {
            advanceChart()
        }, timerMin * 1000);

        return () => clearInterval(id);
    }, []);


    const advanceChart = () => {
        const state = replay.current;

        const candleWindow = getCandleWindow(candleData, state.windowIndex, timerMin)
        if (candleWindow.length === 0) {
            return;
        }
        let currentCandle = candleWindow[0]

        const timeFrameCandles = candleWindow.slice(1)

        timeFrameCandles.forEach((candle, index) => {
            setTimeout(() => {
                currentCandle = aggregateCandle(currentCandle, candle);
                setCandles(prev => {
                    const next = [...prev];
                    next[next.length - 1] = currentCandle;
                    return next;
                });
            }, (index + 1) * 1000);
        })


        // Advance engine synchronously
        state.windowIndex++;
        setCandles(prev => [...prev, currentCandle]);
    }

    return {
        candles,
        volume,
        replay,
    };
}
