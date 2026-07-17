import type { IChartApi } from "lightweight-charts";
import { useRef, useState } from "react";

export function useGoToLatest() {
    const chartRef = useRef<IChartApi | null>(null);
    const [showGoToLatest, setShowGoToLatest] = useState(false);

    const handleChartInit = (chartApi: IChartApi) => {
        chartRef.current = chartApi;

        const timeScale = chartApi.timeScale();

        const handler = () => {
            const position = timeScale.scrollPosition();
            setShowGoToLatest(Math.abs(position) > 0.5);
        };

        timeScale.subscribeVisibleLogicalRangeChange(handler);
        handler();
    };

    const goToLatest = () => {
        chartRef.current?.timeScale().scrollToRealTime();
        setShowGoToLatest(false);
    };

    return {
        handleChartInit,
        showGoToLatest,
        goToLatest,
    };
}
