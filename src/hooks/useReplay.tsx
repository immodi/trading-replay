import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Color } from "@/constants/replay";
import { aggregateCandle } from "@/utils/aggregateCandle";
import type { Candle } from "@/types/candle";
import type { PlayDirection } from "@/types/replay";

export type { PlayDirection } from "@/types/replay";

interface StateSnapshot {
    candles: Candle[];
    currentCandle: Candle | null;
    minutesInCurrent: number;
}

export type ReplayOptions = {
    /**
     * Raw-candle index to restore on first load. When set, playback starts
     * paused at that point instead of auto-playing from the beginning.
     */
    restoreIndex?: number;
    /** Direction to restore together with `restoreIndex`. */
    restoreDirection?: PlayDirection;
    /**
     * The surrounding data (day candles and aggregated history) is ready.
     * The restore is applied only once this is true.
     */
    restoreReady?: boolean;
};

export function useReplay(
    timeFrameMinutes: number,
    chartSpeed: number,
    source: Candle[] | null,
    initialCandles: Candle[] = [],
    options: ReplayOptions = {},
) {
    const timeoutRef = useRef<number | null>(null);
    const timeFrameRef = useRef(timeFrameMinutes);
    const speedRef = useRef(chartSpeed);
    const initialCandlesRef = useRef(initialCandles);
    const lastSourceRef = useRef<Candle[] | null>(null);
    const lastInitialCandlesRef = useRef<Candle[] | null>(null);
    const lastTimeFrameRef = useRef<number | null>(null);
    const directionRef = useRef<PlayDirection>(
        options.restoreDirection ?? "forward",
    );
    // StrictMode unmounts and remounts once; remember whether playback was
    // running so the simulated remount can resume instead of silently pausing.
    const shouldResumeRef = useRef(false);

    const srcRef = useRef<Candle[]>(source ?? []);
    const indexRef = useRef<number>(0);

    // Captured once: later store writes must not re-trigger a restore.
    const restoreTargetRef = useRef<{
        index: number;
        direction: PlayDirection;
    } | null>(
        options.restoreIndex !== undefined
            ? {
                  index: options.restoreIndex,
                  direction: options.restoreDirection ?? "forward",
              }
            : null,
    );

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
    const [direction, setDirection] = useState<PlayDirection>(
        options.restoreDirection ?? "forward",
    );
    const [index, setIndex] = useState<number>(0);
    const [hasRestored, setHasRestored] = useState<boolean>(false);

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
        setIndex(idx + 1);
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
        setIndex(prevIdx);
        setCandles(state.candles);
        const session = state.candles.slice(initialLengthRef.current);
        setSessionCandles(session);

        return true;
    }, []);

    const stop = useCallback(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        // Always settle to a paused state: `start` can bail out immediately on
        // an empty dataset, without ever creating a timeout.
        setIsPlaying(false);
    }, []);

    const start = useCallback(
        (direction: PlayDirection) => {
            if (timeoutRef.current !== null) return;

            setIsPlaying(true);
            setDirection(direction);
            directionRef.current = direction;

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
        [stop, tickForward, tickBackward]
    );

    /** Rebuild the snapshot cache and park the replay at `target.index`. */
    const applyRestore = useCallback(
        (target: { index: number; direction: PlayDirection }) => {
            stop();
            setIsPlaying(false);

            const src = srcRef.current;
            const clamped = Math.max(0, Math.min(target.index, src.length));

            let snapshot: StateSnapshot = {
                candles: initialCandlesRef.current,
                currentCandle: null,
                minutesInCurrent: 0,
            };

            const cache: StateSnapshot[] = [snapshot];
            for (let i = 0; i < clamped; i++) {
                snapshot = applyForwardTick(snapshot, src[i]);
                cache.push(snapshot);
            }

            stateCacheRef.current = cache;
            indexRef.current = clamped;
            initialLengthRef.current = initialCandlesRef.current.length;

            setCandles(snapshot.candles);
            setSessionCandles(
                snapshot.candles.slice(initialLengthRef.current),
            );
            setDirection(target.direction);
            directionRef.current = target.direction;
            setIsDone(clamped >= src.length);
            setIndex(clamped);
        },
        [applyForwardTick, stop],
    );

    /** Reset to the beginning without playing. */
    const resetToStart = useCallback(() => {
        stop();

        const initSnapshot: StateSnapshot = {
            candles: initialCandlesRef.current,
            currentCandle: null,
            minutesInCurrent: 0,
        };
        indexRef.current = 0;
        stateCacheRef.current = [initSnapshot];
        initialLengthRef.current = initialCandlesRef.current.length;

        setCandles(initialCandlesRef.current);
        setSessionCandles([]);
        setIsDone(false);
        setIsPlaying(false);
        setIndex(0);
    }, [stop]);

    const restart = useCallback(() => {
        resetToStart();

        // A pending restore keeps playback parked until the data is ready.
        if (restoreTargetRef.current !== null) return;

        start("forward");
    }, [resetToStart, start]);

    const playback = useCallback(
        (direction: PlayDirection) => {
            stop();
            start(direction);
        },
        [stop, start]
    );

    useEffect(() => {
        if (!source) return;
        // Data objects are stable between renders; this also prevents
        // StrictMode's double effect run from resetting a restored replay.
        if (lastSourceRef.current === source) return;

        lastSourceRef.current = source;
        srcRef.current = source;
        restart();
    }, [source, restart]);

    useEffect(() => {
        if (lastInitialCandlesRef.current === initialCandles) return;

        lastInitialCandlesRef.current = initialCandles;
        initialCandlesRef.current = initialCandles;
        restart();
    }, [initialCandles, restart]);

    useEffect(() => {
        speedRef.current = chartSpeed;
    }, [chartSpeed]);

    useEffect(() => {
        timeFrameRef.current = timeFrameMinutes;

        if (lastTimeFrameRef.current === timeFrameMinutes) return;
        lastTimeFrameRef.current = timeFrameMinutes;
        restart();
    }, [timeFrameMinutes, restart]);

    // Cancel the playback timer on unmount; StrictMode's simulated remount
    // resumes from where it stopped instead of silently pausing forever.
    useEffect(() => {
        return () => {
            shouldResumeRef.current = timeoutRef.current !== null;
            stop();
        };
    }, [stop]);

    // Runs after the data effects above so a restore wins over their resets.
    useEffect(() => {
        if (hasRestored) return;
        if (options.restoreReady === false) return;
        if (!source) return;

        const target = restoreTargetRef.current;
        if (target) {
            applyRestore(target);
            restoreTargetRef.current = null;
        }

        setHasRestored(true);
    }, [options.restoreReady, source, hasRestored, applyRestore]);

    // StrictMode remount: resume playback that the simulated unmount stopped.
    useEffect(() => {
        if (!shouldResumeRef.current) return;

        shouldResumeRef.current = false;
        start(directionRef.current);
    }, [start]);

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
        index,
        hasRestored,
        start,
        stop,
        playback,
        restart,
    };
}
