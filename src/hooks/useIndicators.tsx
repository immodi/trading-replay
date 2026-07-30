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

    useEffect(() => {
        if (!chartApi)
            return;

        // EMA
        if (settings.ema.enabled) {
            if (!emaSeries.current) {
                emaSeries.current = chartApi.addSeries(LineSeries, {
                    color: settings.ema.color,
                    lineWidth: 4,
                });
            }

            ema.current = new EMAIndicator(
                settings.ema.period,
                priceData.History,
            );

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

            sma.current = new SMAIndicator(
                settings.sma.period,
                priceData.History,
            );

            smaSeries.current.setData(sma.current.getData());
        } else if (smaSeries.current) {
            chartApi.removeSeries(smaSeries.current);
            smaSeries.current = null;
            sma.current = null;
        }

        // VWAP
        if (settings.vwap.enabled) {
            if (!vwapSeries.current) {
                vwapSeries.current = chartApi.addSeries(LineSeries, {
                    color: settings.vwap.color,
                    lineWidth: 4,
                });
            }

            vwap.current = new VWAPIndicator(priceData.History);

            vwapSeries.current.setData(vwap.current.getData());
        } else if (vwapSeries.current) {
            chartApi.removeSeries(vwapSeries.current);
            vwapSeries.current = null;
            vwap.current = null;
        }
    }, [chartApi, settings, priceData.History]);

    useEffect(() => {
        if (!priceData.Time)
            return;

        const e = ema.current?.update(priceData);
        if (e && Number.isFinite(e.value)) {
            emaSeries.current?.update(e);
        }

        const s = sma.current?.update(priceData);
        if (s && Number.isFinite(s.value)) {
            smaSeries.current?.update(s);
        }

        const v = vwap.current?.update(priceData);
        if (v && Number.isFinite(v.value)) {
            vwapSeries.current?.update(v);
        }
    }, [priceData]);


    const reset = (history: PriceData[] = []) => {
        ema.current?.reset(history);
        sma.current?.reset(history);
        vwap.current?.reset(history);

        emaSeries.current?.setData(
            ema.current?.getData() ?? []
        );

        smaSeries.current?.setData(
            sma.current?.getData() ?? []
        );

        vwapSeries.current?.setData(
            vwap.current?.getData() ?? []
        );
    };

    return {
        reset,
    };
}
