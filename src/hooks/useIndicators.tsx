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
    fullPriceData: PriceData;   // aggregated history + replay candles (for EMA & SMA)
    sessionPriceData: PriceData; // only replay candles (for VWAP)
    settings: IndicatorSettings;
};

export function useIndicators({
    chartApi,
    fullPriceData,
    sessionPriceData,
    settings,
}: Props) {
    const ema = useRef<EMAIndicator | null>(null);
    const sma = useRef<SMAIndicator | null>(null);
    const vwap = useRef<VWAPIndicator | null>(null);

    const emaSeries = useRef<ISeriesApi<"Line"> | null>(null);
    const smaSeries = useRef<ISeriesApi<"Line"> | null>(null);
    const vwapSeries = useRef<ISeriesApi<"Line"> | null>(null);

    const getSortedHistory = (history: PriceData[]) =>
        [...history].sort((a, b) => a.Time - b.Time);

    const refreshIndicator = <T extends { reset: (data: PriceData[]) => void; getData: () => any }>(
        indicator: T | null,
        series: ISeriesApi<"Line"> | null,
        history: PriceData[]
    ) => {
        if (!indicator || !series) return;
        const sorted = getSortedHistory(history);
        indicator.reset(sorted);
        series.setData(indicator.getData());
    };

    // --- Create / remove series and initialise indicators ---
    useEffect(() => {
        if (!chartApi) return;

        const fullHistory = fullPriceData.History;
        const sessionHistory = sessionPriceData.History;

        // EMA
        if (settings.ema.enabled) {
            if (!emaSeries.current) {
                emaSeries.current = chartApi.addSeries(LineSeries, {
                    color: settings.ema.color,
                    lineWidth: 4,
                });
            }
            ema.current = new EMAIndicator(settings.ema.period, fullHistory);
            emaSeries.current.setData(ema.current.getData());
        } else if (emaSeries.current) {
            chartApi.removeSeries(emaSeries.current);
            emaSeries.current = null;
            ema.current = null;
        }

        // SMA
        if (settings.sma.enabled) {
            if (!smaSeries.current) {
                smaSeries.current = chartApi.addSeries(LineSeries, {
                    color: settings.sma.color,
                    lineWidth: 4,
                });
            }
            sma.current = new SMAIndicator(settings.sma.period, fullHistory);
            smaSeries.current.setData(sma.current.getData());
        } else if (smaSeries.current) {
            chartApi.removeSeries(smaSeries.current);
            smaSeries.current = null;
            sma.current = null;
        }

        // VWAP – uses sessionHistory (current day only)
        if (settings.vwap.enabled) {
            if (!vwapSeries.current) {
                vwapSeries.current = chartApi.addSeries(LineSeries, {
                    color: settings.vwap.color,
                    lineWidth: 4,
                });
            }
            vwap.current = new VWAPIndicator(sessionHistory);
            vwapSeries.current.setData(vwap.current.getData());
        } else if (vwapSeries.current) {
            chartApi.removeSeries(vwapSeries.current);
            vwapSeries.current = null;
            vwap.current = null;
        }
    }, [chartApi, settings]); // Dependencies: no history arrays; we refresh via separate effect

    // --- Refresh indicators when data changes ---
    useEffect(() => {
        if (!chartApi) return;

        const fullHistory = fullPriceData.History;
        const sessionHistory = sessionPriceData.History;

        refreshIndicator(ema.current, emaSeries.current, fullHistory);
        refreshIndicator(sma.current, smaSeries.current, fullHistory);
        refreshIndicator(vwap.current, vwapSeries.current, sessionHistory);
    }, [fullPriceData.History, sessionPriceData.History, chartApi]);

    // --- Also refresh on every tick (priceData object change) ---
    useEffect(() => {
        if (!fullPriceData.Time) return; // fullPriceData has latest time
        const fullHistory = fullPriceData.History;
        const sessionHistory = sessionPriceData.History;

        refreshIndicator(ema.current, emaSeries.current, fullHistory);
        refreshIndicator(sma.current, smaSeries.current, fullHistory);
        refreshIndicator(vwap.current, vwapSeries.current, sessionHistory);
    }, [fullPriceData, sessionPriceData]);

    // --- Reset function ---
    const reset = (fullHistoryOverride: PriceData[] = []) => {
        const fullHist = fullHistoryOverride.length ? fullHistoryOverride : fullPriceData.History;
        const sessionHist = sessionPriceData.History;

        refreshIndicator(ema.current, emaSeries.current, fullHist);
        refreshIndicator(sma.current, smaSeries.current, fullHist);
        refreshIndicator(vwap.current, vwapSeries.current, sessionHist);
    };

    return { reset };
}
