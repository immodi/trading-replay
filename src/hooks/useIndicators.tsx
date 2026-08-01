import { useEffect, useRef } from "react";
import {
    LineSeries,
    type IChartApi,
    type ISeriesApi,
} from "lightweight-charts";

import type { IndicatorSettings } from "@/types/indicator";
import type { PriceData } from "@/types/priceData";
import { EMAIndicator } from "@/indicators/ema";
import { SMAIndicator } from "@/indicators/sma";
import { VWAPIndicator } from "@/indicators/vwap";

type Props = {
    chartApi: IChartApi | null;
    priceData: PriceData;
    settings: IndicatorSettings;
};

export function useIndicators({
    chartApi,
    priceData,
    settings,
}: Props) {
    const ema = useRef<EMAIndicator | null>(null);
    const sma = useRef<SMAIndicator | null>(null);
    const vwap = useRef<VWAPIndicator | null>(null);

    const emaSeries = useRef<ISeriesApi<"Line"> | null>(null);
    const smaSeries = useRef<ISeriesApi<"Line"> | null>(null);
    const vwapSeries = useRef<ISeriesApi<"Line"> | null>(null);

    // Helper: sort history by time (ascending)
    const getSortedHistory = (history: PriceData[]) =>
        [...history].sort((a, b) => a.Time - b.Time);

    // Helper: update all indicator series with the latest full data
    const refreshAllIndicators = (history: PriceData[]) => {
        const sortedHistory = getSortedHistory(history);

        if (ema.current && emaSeries.current) {
            ema.current.reset(sortedHistory);
            emaSeries.current.setData(ema.current.getData());
        }
        if (sma.current && smaSeries.current) {
            sma.current.reset(sortedHistory);
            smaSeries.current.setData(sma.current.getData());
        }
        if (vwap.current && vwapSeries.current) {
            vwap.current.reset(sortedHistory);
            vwapSeries.current.setData(vwap.current.getData());
        }
    };

    // --- Create series and initialise indicators (runs once per setting change) ---
    useEffect(() => {
        if (!chartApi) return;

        const sortedHistory = getSortedHistory(priceData.History);

        // EMA
        if (settings.ema.enabled) {
            if (!emaSeries.current) {
                emaSeries.current = chartApi.addSeries(LineSeries, {
                    color: settings.ema.color,
                    lineWidth: 4,
                });
            }
            ema.current = new EMAIndicator(settings.ema.period, sortedHistory);
            emaSeries.current.setData(ema.current.getData());
        } else if (emaSeries.current) {
            chartApi.removeSeries(emaSeries.current);
            emaSeries.current = null;
            ema.current = null;
        }

        // SMA (same pattern)
        if (settings.sma.enabled) {
            if (!smaSeries.current) {
                smaSeries.current = chartApi.addSeries(LineSeries, {
                    color: settings.sma.color,
                    lineWidth: 4,
                });
            }
            sma.current = new SMAIndicator(settings.sma.period, sortedHistory);
            smaSeries.current.setData(sma.current.getData());
        } else if (smaSeries.current) {
            chartApi.removeSeries(smaSeries.current);
            smaSeries.current = null;
            sma.current = null;
        }

        // VWAP (same pattern)
        if (settings.vwap.enabled) {
            if (!vwapSeries.current) {
                vwapSeries.current = chartApi.addSeries(LineSeries, {
                    color: settings.vwap.color,
                    lineWidth: 4,
                });
            }
            vwap.current = new VWAPIndicator(sortedHistory);
            vwapSeries.current.setData(vwap.current.getData());
        } else if (vwapSeries.current) {
            chartApi.removeSeries(vwapSeries.current);
            vwapSeries.current = null;
            vwap.current = null;
        }
    }, [chartApi, settings]); // Only when API or settings change

    // --- Refresh indicators on every priceData change (forward or backward) ---
    useEffect(() => {
        if (!priceData.Time) return; // avoid empty data
        refreshAllIndicators(priceData.History);
    }, [priceData]); // runs on every tick

    // --- Reset function (used externally) ---
    const reset = (history: PriceData[] = []) => {
        const hist = history.length ? history : priceData.History;
        refreshAllIndicators(hist);
    };

    return { reset };
}
