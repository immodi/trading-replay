import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { generateCandles, type Candle } from "@/data/generateCandles";
import { aggregateCandle } from "@/utils/aggregateCandle";
import { Color } from "@/constants/replay";

interface ReplayState {
    sourceIndex: number;
    currentCandle: Candle | null;
    minutesInCurrent: number;
    candlesSrc: Candle[];
}

export function useReplay(timeFrameMinutes: number, chartSpeed: number) {
    const timeoutRef = useRef<number | null>(null);
    const timeFrameRef = useRef(timeFrameMinutes);
    const speedRef = useRef(chartSpeed);

    const replay = useRef<ReplayState>({
        sourceIndex: 0,
        currentCandle: null,
        minutesInCurrent: 0,
        candlesSrc: generateCandles(100),
    });

    const [candles, setCandles] = useState<Candle[]>([]);

    const volume = useMemo(
        () =>
            candles.map(candle => ({
                time: candle.time,
                value: candle.volume,
                color:
                    candle.close >= candle.open
                        ? Color.Bullish
                        : Color.Bearish,
            })),
        [candles]
    );


    const stop = useCallback(() => {
        // console.log("STOP LOOP");
        if (timeoutRef.current === null) return;

        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }, []);


    const tick = useCallback(() => {
        const state = replay.current;
        const sourceCandle = state.candlesSrc[state.sourceIndex];

        // console.log(
        //     "tick",
        //     state.sourceIndex,
        //     state.candlesSrc.length
        // );

        if (!sourceCandle) {
            return false;
        }

        if (state.currentCandle === null) {
            const currentCandle = { ...sourceCandle };

            state.currentCandle = currentCandle;

            setCandles(prev => [
                ...prev,
                currentCandle
            ]);

        } else {
            const nextCandle = aggregateCandle(
                state.currentCandle,
                sourceCandle
            );

            state.currentCandle = nextCandle;

            setCandles(prev => {
                const next = [...prev];
                next[next.length - 1] = nextCandle;
                return next;
            });
        }

        state.sourceIndex++;
        state.minutesInCurrent++;

        if (state.minutesInCurrent === timeFrameRef.current) {
            state.currentCandle = null;
            state.minutesInCurrent = 0;
        }

        return true;

    }, []);


    const start = useCallback(() => {
        // console.log("START LOOP");
        if (timeoutRef.current !== null) return;

        const loop = () => {
            const running = tick();

            if (!running) {
                timeoutRef.current = null;
                return;
            }

            timeoutRef.current = window.setTimeout(
                loop,
                speedRef.current
            );
        };

        loop();

    }, [tick]);


    const restart = useCallback(() => {
        stop();

        const state = replay.current;

        state.sourceIndex = 0;
        state.minutesInCurrent = 0;
        state.currentCandle = null;

        setCandles([]);

        start();

    }, [stop, start]);


    useEffect(() => {
        speedRef.current = chartSpeed;
    }, [chartSpeed]);


    useEffect(() => {
        timeFrameRef.current = timeFrameMinutes;
        restart();

        return stop;
    }, [timeFrameMinutes, restart, stop]);


    return {
        candles,
        volume,
        start,
        stop,
        restart,
    };
}
