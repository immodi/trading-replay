import { useEffect, useRef } from "react";

export function useInterval(
    callback: () => void,
    intervalMs: number
) {
    const timer = useRef<number | null>(null);

    function resume() {
        if (timer.current !== null) return;

        timer.current = window.setInterval(callback, intervalMs);
    }

    function pause() {
        if (timer.current === null) return;

        clearInterval(timer.current);
        timer.current = null;
    }

    useEffect(() => {
        return pause;
    }, []);

    return { pause, resume };
}
