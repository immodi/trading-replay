import { useMemo } from "react";
import type { LineData, UTCTimestamp } from "lightweight-charts";

import type { IndicatorConfig, IndicatorType } from "@/types/indicator";
import type { PriceData } from "@/types/priceData";
import { EMAIndicator } from "@/indicators/ema";
import { SMAIndicator } from "@/indicators/sma";
import { VWAPIndicator } from "@/indicators/vwap";

type Props = {
    fullPriceData: PriceData; // aggregated history + replay candles (EMA & SMA)
    sessionPriceData: PriceData; // only replay candles (VWAP)
    settings: IndicatorConfig[];
};

type Histories = {
    full: PriceData[];
    session: PriceData[];
};

export type IndicatorLine = {
    config: IndicatorConfig;
    data: LineData<UTCTimestamp>[];
};

function sortByTime(history: PriceData[]): PriceData[] {
    return [...history].sort((a, b) => a.Time - b.Time);
}

function historyFor(type: IndicatorType, histories: Histories): PriceData[] {
    return type === "vwap" ? histories.session : histories.full;
}

function buildData(config: IndicatorConfig, histories: Histories): LineData<UTCTimestamp>[] {
    const history = historyFor(config.type, histories);

    switch (config.type) {
        case "ema":
            return new EMAIndicator(config.period, history).getData();
        case "sma":
            return new SMAIndicator(config.period, history).getData();
        case "vwap":
            return new VWAPIndicator(history).getData();
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
                data: buildData(config, histories),
            }));
    }, [settings, fullHistory, sessionHistory]);
}
