import { useEffect, useMemo, useRef, useState } from "react";

import { generateCandles, type Candle } from "@/data/generateCandles";
import { aggregateCandle } from "@/utils/aggregateCandle";


interface ReplayState {
    sourceIndex: number;
    currentCandle: Candle | null;
    minutesInCurrent: number;
    candlesSrc: Candle[];
}

export function useReplay(timerMin: number) {
    // Engine state (does not trigger renders)
    const replay = useRef<ReplayState>({
        sourceIndex: 0,
        currentCandle: null,
        minutesInCurrent: 0,
        candlesSrc: generateCandles(100 * 60),
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
            const state = replay.current;
            if (state.sourceIndex >= state.candlesSrc.length) {
                clearInterval(id);
                return;
            }

            tick();

        }, 1000);

        return () => clearInterval(id);
    }, [timerMin]);


    const tick = () => {
        const state = replay.current;

        const sourceCandle = state.candlesSrc[state.sourceIndex];
        if (!sourceCandle) return;

        if (state.currentCandle === null) {
            // Create new candle
            state.currentCandle = sourceCandle;

            setCandles(prev => [...prev, sourceCandle]);
        } else {
            // Update existing candle
            const nextCandle = aggregateCandle(state.currentCandle, sourceCandle);
            state.currentCandle = nextCandle

            setCandles(prev => {
                const next = [...prev];
                next[next.length - 1] = nextCandle;
                return next;
            });
        }


        // Advance engine synchronously
        state.sourceIndex++;
        state.minutesInCurrent++;

        if (state.minutesInCurrent === timerMin) {
            state.currentCandle = null;
            state.minutesInCurrent = 0;
        }
    }

    return {
        candles,
        volume,
        replay,
    };
}
