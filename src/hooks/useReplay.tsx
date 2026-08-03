import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Color } from "@/constants/replay";
import { aggregateCandle } from "@/utils/aggregateCandle";
import type { Candle } from "@/types/candle";

interface StateSnapshot {
    candles: Candle[];
    currentCandle: Candle | null;
    minutesInCurrent: number;
}

export function useReplay(
    timeFrameMinutes: number,
    chartSpeed: number,
    source: Candle[] | null,
    initialCandles: Candle[] = []
) {
    const timeoutRef = useRef<number | null>(null);
    const timeFrameRef = useRef(timeFrameMinutes);
    const speedRef = useRef(chartSpeed);
    const initialCandlesRef = useRef(initialCandles);

    const srcRef = useRef<Candle[]>(source ?? []);
    const indexRef = useRef<number>(0);

    const initialSnapshot: StateSnapshot = {
        candles: initialCandles,
        currentCandle: null,
        minutesInCurrent: 0,
    };

    const stateCacheRef = useRef<StateSnapshot[]>([initialSnapshot]);

    const [candles, setCandles] = useState<Candle[]>(initialCandles);
    const [sessionCandles, setSessionCandles] = useState<Candle[]>([]);
    const initialLengthRef = useRef(initialCandles.length);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isDone, setIsDone] = useState<boolean>(false);
    const [direction, setDirection] = useState<"forward" | "backward">("forward");

    const applyForwardTick = useCallback(
        (state: StateSnapshot, sourceCandle: Candle): StateSnapshot => {
            let { candles, currentCandle, minutesInCurrent } = state;

            if (currentCandle === null) {
                currentCandle = { ...sourceCandle };
                candles = [...candles, currentCandle];
                minutesInCurrent = 1;
            } else {
                const nextCandle = aggregateCandle(currentCandle, sourceCandle);
                currentCandle = nextCandle;
                candles = [...candles.slice(0, -1), nextCandle];
                minutesInCurrent++;
            }

            if (minutesInCurrent === timeFrameRef.current) {
                currentCandle = null;
                minutesInCurrent = 0;
            }

            return { candles, currentCandle, minutesInCurrent };
        },
        [timeFrameRef]
    );

    const tickForward = useCallback((): boolean => {
        const idx = indexRef.current;
        const src = srcRef.current;
        if (idx >= src.length) return false;

        const currentState = stateCacheRef.current[idx];
        const nextState = applyForwardTick(currentState, src[idx]);

        stateCacheRef.current[idx + 1] = nextState;
        indexRef.current = idx + 1;
        setCandles(nextState.candles);
        const session = nextState.candles.slice(initialLengthRef.current);
        setSessionCandles(session);

        return true;
    }, [applyForwardTick]);

    const tickBackward = useCallback((): boolean => {
        const idx = indexRef.current;
        if (idx <= 0) return false;

        const prevIdx = idx - 1;
        indexRef.current = prevIdx;
        const state = stateCacheRef.current[prevIdx];
        setCandles(state.candles);
        const session = state.candles.slice(initialLengthRef.current);
        setSessionCandles(session);

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

        const initSnapshot: StateSnapshot = {
            candles: initialCandlesRef.current,
            currentCandle: null,
            minutesInCurrent: 0,
        };
        indexRef.current = 0;
        stateCacheRef.current = [initSnapshot];
        setCandles(initialCandlesRef.current);
        setSessionCandles([]);
        initialLengthRef.current = initialCandlesRef.current.length;
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

    useEffect(() => {
        if (!source) return;
        srcRef.current = source;
        restart();
    }, [source, restart]);

    useEffect(() => {
        initialCandlesRef.current = initialCandles;
        restart();
    }, [initialCandles, restart]);

    useEffect(() => {
        speedRef.current = chartSpeed;
    }, [chartSpeed]);

    useEffect(() => {
        timeFrameRef.current = timeFrameMinutes;
        restart();
        return stop;
    }, [timeFrameMinutes, restart, stop]);

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
        sessionCandles,
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
