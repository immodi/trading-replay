import { useEffect, useMemo, useRef } from "react";
import {
    LineSeries,
    type IChartApi,
    type ISeriesApi,
    type LineData,
    type UTCTimestamp,
} from "lightweight-charts";

import type { IndicatorConfig, IndicatorType } from "@/types/indicator";
import type { PriceData } from "@/types/priceData";
import { EMAIndicator } from "@/indicators/ema";
import { SMAIndicator } from "@/indicators/sma";
import { VWAPIndicator } from "@/indicators/vwap";

type Props = {
    chartApi: IChartApi | null;
    fullPriceData: PriceData; // aggregated history + replay candles (EMA & SMA)
    sessionPriceData: PriceData; // only replay candles (VWAP)
    settings: IndicatorConfig[];
};

type IndicatorEngine = {
    reset(data?: PriceData[]): void;
    getData(): LineData<UTCTimestamp>[];
};

type Histories = {
    full: PriceData[];
    session: PriceData[];
};

type IndicatorRuntime = {
    config: IndicatorConfig;
    engine: IndicatorEngine;
    series: ISeriesApi<"Line">;
};

function sortByTime(history: PriceData[]): PriceData[] {
    return [...history].sort((a, b) => a.Time - b.Time);
}

function historyFor(type: IndicatorType, histories: Histories): PriceData[] {
    return type === "vwap" ? histories.session : histories.full;
}

function createEngine(
    config: IndicatorConfig,
    history: PriceData[],
): IndicatorEngine {
    switch (config.type) {
        case "ema":
            return new EMAIndicator(config.period, history);
        case "sma":
            return new SMAIndicator(config.period, history);
        case "vwap":
            return new VWAPIndicator(history);
    }
}

function refresh(runtime: IndicatorRuntime, histories: Histories): void {
    runtime.engine.reset(historyFor(runtime.config.type, histories));
    runtime.series.setData(runtime.engine.getData());
}

export function useIndicators({
    chartApi,
    fullPriceData,
    sessionPriceData,
    settings,
}: Props) {
    // One runtime per configured instance, keyed by the stable indicator id.
    const runtimes = useRef(new Map<string, IndicatorRuntime>());
    const chartApiRef = useRef<IChartApi | null>(null);

    // Sorting once per data change keeps the per-indicator refresh cheap.
    const fullHistory = useMemo(
        () => sortByTime(fullPriceData.History ?? []),
        [fullPriceData.History],
    );
    const sessionHistory = useMemo(
        () => sortByTime(sessionPriceData.History ?? []),
        [sessionPriceData.History],
    );

    // Effects that should not depend on every replay tick read the latest
    // history through this ref.
    const historiesRef = useRef<Histories>({
        full: fullHistory,
        session: sessionHistory,
    });

    useEffect(() => {
        historiesRef.current = { full: fullHistory, session: sessionHistory };
    }, [fullHistory, sessionHistory]);

    // --- Add, remove, and update series when the configuration changes ---
    useEffect(() => {
        if (!chartApi) {
            chartApiRef.current = null;
            runtimes.current.clear();
            return;
        }

        // A different chart instance cannot reuse the old series handles.
        if (chartApiRef.current !== chartApi) {
            runtimes.current.clear();
            chartApiRef.current = chartApi;
        }

        const map = runtimes.current;
        const histories = historiesRef.current;
        const active = new Set<string>();

        for (const config of settings) {
            if (!config.enabled) continue;

            active.add(config.id);
            let runtime = map.get(config.id);

            // A type change needs a fresh engine and series options.
            if (runtime && runtime.config.type !== config.type) {
                chartApi.removeSeries(runtime.series);
                map.delete(config.id);
                runtime = undefined;
            }

            if (!runtime) {
                const series = chartApi.addSeries(LineSeries, {
                    color: config.color,
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false,
                });
                const engine = createEngine(
                    config,
                    historyFor(config.type, histories),
                );

                series.setData(engine.getData());
                map.set(config.id, { config, engine, series });
                continue;
            }

            if (runtime.config.color !== config.color) {
                runtime.series.applyOptions({ color: config.color });
            }

            if (runtime.config.period !== config.period) {
                runtime.engine = createEngine(
                    config,
                    historyFor(config.type, histories),
                );
                runtime.series.setData(runtime.engine.getData());
            }

            runtime.config = config;
        }

        for (const [id, runtime] of map) {
            if (active.has(id)) continue;

            chartApi.removeSeries(runtime.series);
            map.delete(id);
        }
    }, [chartApi, settings]);

    // --- Refresh every active indicator as replay candles arrive ---
    useEffect(() => {
        if (!chartApi) return;

        const histories: Histories = {
            full: fullHistory,
            session: sessionHistory,
        };

        for (const runtime of runtimes.current.values()) {
            refresh(runtime, histories);
        }
    }, [chartApi, fullHistory, sessionHistory]);

    /** Rebuild all active indicators from the latest available data. */
    const reset = () => {
        for (const runtime of runtimes.current.values()) {
            refresh(runtime, historiesRef.current);
        }
    };

    return { reset };
}
