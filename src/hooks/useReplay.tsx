import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Color } from "@/constants/replay";
import { aggregateCandle } from "@/utils/aggregateCandle";
import type { Candle } from "@/types/candle";

interface StateSnapshot {
    candles: Candle[];
    currentCandle: Candle | null;
    minutesInCurrent: number;
}

export function useReplay(timeFrameMinutes: number, chartSpeed: number, source: Candle[] | null) {
    const timeoutRef = useRef<number | null>(null);
    const timeFrameRef = useRef(timeFrameMinutes);
    const speedRef = useRef(chartSpeed);

    // Source data and current position (how many source ticks have been processed)
    const srcRef = useRef<Candle[]>(source ?? []);
    const indexRef = useRef<number>(0);

    // Cache: stateCache[i] = state after processing i source candles
    const stateCacheRef = useRef<StateSnapshot[]>([
        { candles: [], currentCandle: null, minutesInCurrent: 0 },
    ]);

    const [candles, setCandles] = useState<Candle[]>([]);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isDone, setIsDone] = useState<boolean>(false);
    const [direction, setDirection] = useState<"forward" | "backward">("forward");

    // Pure function: given a state and one new source candle, return the next state.
    const applyForwardTick = useCallback(
        (state: StateSnapshot, sourceCandle: Candle): StateSnapshot => {
            let { candles, currentCandle, minutesInCurrent } = state;

            if (currentCandle === null) {
                // Start a new aggregated candle
                currentCandle = { ...sourceCandle };
                candles = [...candles, currentCandle];
                minutesInCurrent = 1;
            } else {
                // Aggregate into the current candle
                const nextCandle = aggregateCandle(currentCandle, sourceCandle);
                currentCandle = nextCandle;
                candles = [...candles.slice(0, -1), nextCandle];
                minutesInCurrent++;
            }

            // If the timeframe is complete, reset the partial candle
            if (minutesInCurrent === timeFrameRef.current) {
                currentCandle = null;
                minutesInCurrent = 0;
            }

            return { candles, currentCandle, minutesInCurrent };
        },
        [timeFrameRef]
    );

    // Move forward one source tick
    const tickForward = useCallback((): boolean => {
        const idx = indexRef.current;
        const src = srcRef.current;
        if (idx >= src.length) return false;

        const currentState = stateCacheRef.current[idx];
        const nextState = applyForwardTick(currentState, src[idx]);

        // Store the new state in cache and update the index
        stateCacheRef.current[idx + 1] = nextState;
        indexRef.current = idx + 1;
        setCandles(nextState.candles);

        return true;
    }, [applyForwardTick]);

    // Move backward one source tick – just restore the previous snapshot
    const tickBackward = useCallback((): boolean => {
        const idx = indexRef.current;
        if (idx <= 0) return false;

        const prevIdx = idx - 1;
        indexRef.current = prevIdx;
        const state = stateCacheRef.current[prevIdx];
        setCandles(state.candles);

        return true;
    }, []);

    const start = useCallback(
        (direction: "forward" | "backward") => {
            if (timeoutRef.current !== null) return;

            setIsPlaying(true);
            setDirection(direction);

            const loop = () => {
                const running = direction === "forward" ? tickForward() : tickBackward();

                if (!running) {
                    stop();
                    setIsDone(true);
                    timeoutRef.current = null;
                    return;
                }

                timeoutRef.current = window.setTimeout(loop, speedRef.current);
            };

            loop();
        },
        [tickForward, tickBackward]
    );

    const stop = useCallback(() => {
        if (timeoutRef.current === null) return;
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        setIsPlaying(false);
    }, []);

    const restart = useCallback(() => {
        stop();

        // Reset to the initial state
        indexRef.current = 0;
        stateCacheRef.current = [{ candles: [], currentCandle: null, minutesInCurrent: 0 }];
        setCandles([]);
        setIsDone(false);

        start("forward");
    }, [stop, start]);

    const playback = useCallback(
        (direction: "forward" | "backward") => {
            stop();
            start(direction);
        },
        [stop, start]
    );

    // When source changes, rebuild the cache and restart
    useEffect(() => {
        if (!source) return;

        srcRef.current = source;
        indexRef.current = 0;
        stateCacheRef.current = [{ candles: [], currentCandle: null, minutesInCurrent: 0 }];
        setCandles([]);
        setIsDone(false);

        restart();
    }, [source, restart]);

    // Update speed reference
    useEffect(() => {
        speedRef.current = chartSpeed;
    }, [chartSpeed]);

    // When timeframe changes, reset and restart
    useEffect(() => {
        timeFrameRef.current = timeFrameMinutes;
        restart();
        return stop;
    }, [timeFrameMinutes, restart, stop]);

    // Memoized volume data for the chart
    const volume = useMemo(
        () =>
            candles.map((candle) => ({
                time: candle.time,
                value: candle.volume,
                color: candle.close >= candle.open ? Color.Bullish : Color.Bearish,
            })),
        [candles]
    );

    return {
        candles,
        volume,
        isPlaying,
        isDone,
        direction,
        start,
        stop,
        playback,
        restart,
    };
}
