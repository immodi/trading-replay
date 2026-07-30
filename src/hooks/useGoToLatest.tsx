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
        const chart = chartRef.current;
        if (!chart) return;

        const priceScale = chart.priceScale("right");

        // 1. Enable auto‑scale temporarily
        priceScale.applyOptions({ autoScale: true });

        // 2. Scroll to the latest time
        chart.timeScale().scrollToRealTime();

        // 3. After the chart has rendered with auto‑scale, turn it off 
        requestAnimationFrame(() => {
            priceScale.applyOptions({ autoScale: false });
        });

        setShowGoToLatest(false);
    };

    return {
        handleChartInit,
        chartRef,
        showGoToLatest,
        goToLatest,
    };
}
