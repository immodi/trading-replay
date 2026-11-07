import { useMemo } from "react";
import {
    LineStyle,
    type LineData,
    type LineWidth,
    type UTCTimestamp,
} from "lightweight-charts";

import type { IndicatorConfig, IndicatorType } from "@/types/indicator";
import type { PriceData } from "@/types/priceData";
import { ATRIndicator } from "@/indicators/atr";
import { EMAIndicator } from "@/indicators/ema";
import { RSIIndicator } from "@/indicators/rsi";
import { SMAIndicator } from "@/indicators/sma";
import { VWAPIndicator } from "@/indicators/vwap";
import { VWAPBandsIndicator } from "@/indicators/vwapBands";

type Props = {
    fullPriceData: PriceData; // aggregated history + replay candles (EMA & SMA)
    sessionPriceData: PriceData; // only replay candles (VWAP)
    settings: IndicatorConfig[];
};

type Histories = {
    full: PriceData[];
    session: PriceData[];
};

export type IndicatorPlot = {
    key: string;
    data: LineData<UTCTimestamp>[];
    color?: string;
    lineWidth?: LineWidth;
    lineStyle?: LineStyle;
};

export type IndicatorLine = {
    config: IndicatorConfig;
    plots: IndicatorPlot[];
};

function sortByTime(history: PriceData[]): PriceData[] {
    return [...history].sort((a, b) => a.Time - b.Time);
}

function historyFor(type: IndicatorType, histories: Histories): PriceData[] {
    return type === "vwap" || type === "vwap-bands"
        ? histories.session
        : histories.full;
}

/** Add an alpha channel to a stored #RRGGBB colour. */
function withAlpha(color: string, alpha: number): string {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return color;

    const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
        .toString(16)
        .padStart(2, "0");

    return `${color}${channel}`;
}

function buildPlots(
    config: IndicatorConfig,
    histories: Histories,
): IndicatorPlot[] {
    const history = historyFor(config.type, histories);

    switch (config.type) {
        case "ema":
            return [
                {
                    key: "main",
                    data: new EMAIndicator(config.period, history).getData(),
                },
            ];
        case "sma":
            return [
                {
                    key: "main",
                    data: new SMAIndicator(config.period, history).getData(),
                },
            ];
        case "vwap":
            return [
                {
                    key: "main",
                    data: new VWAPIndicator(history).getData(),
                },
            ];
        case "vwap-bands": {
            const bands = new VWAPBandsIndicator(history).getData();
            const bandColor = withAlpha(config.color, 0.72);

            return [
                {
                    key: "vwap",
                    data: bands.vwap,
                    color: config.color,
                },
                ...bands.bands
                    .slice(0, config.bandCount)
                    .flatMap((band) => [
                        {
                            key: `upper-${band.multiplier}`,
                            data: band.upper,
                            color: bandColor,
                        },
                        {
                            key: `lower-${band.multiplier}`,
                            data: band.lower,
                            color: bandColor,
                        },
                    ]),
            ];
        }
        case "rsi":
            return [
                {
                    key: "main",
                    data: new RSIIndicator(config.period, history).getData(),
                },
            ];
        case "atr":
            return [
                {
                    key: "main",
                    data: new ATRIndicator(config.period, history).getData(),
                },
            ];
    }
}

/**
 * Builds the line data for every visible indicator. The series themselves are
 * rendered declaratively so the chart library applies candle and overlay data
 * together in the same commit.
 */
export function useIndicators({
    fullPriceData,
    sessionPriceData,
    settings,
}: Props): IndicatorLine[] {
    const fullHistory = useMemo(
        () => sortByTime(fullPriceData.History ?? []),
        [fullPriceData.History],
    );
    const sessionHistory = useMemo(
        () => sortByTime(sessionPriceData.History ?? []),
        [sessionPriceData.History],
    );

    return useMemo(() => {
        const histories: Histories = {
            full: fullHistory,
            session: sessionHistory,
        };

        return settings
            .filter((config) => config.enabled)
            .map((config) => ({
                config,
                plots: buildPlots(config, histories),
            }));
    }, [settings, fullHistory, sessionHistory]);
}
