import { useMemo } from "react";
import { LineStyle, type LineData, type UTCTimestamp } from "lightweight-charts";
import { LineSeries, PriceLine } from "lightweight-charts-react-components";

import { indicatorCatalogEntry } from "@/constants/indicators";
import type { IndicatorConfig } from "@/types/indicator";

type IndicatorSeriesProps = {
    config: IndicatorConfig;
    data: LineData<UTCTimestamp>[];
    pane?: boolean;
    referenceLines?: number[];
};

/**
 * One declarative indicator series. Overlay lines live on the price pane;
 * oscillators such as RSI and ATR render in their own pane.
 */
export function IndicatorSeries({
    config,
    data,
    pane = false,
    referenceLines,
}: IndicatorSeriesProps) {
    const entry = indicatorCatalogEntry(config.type);

    const options = useMemo(
        () => ({
            color: config.color,
            lineWidth: 2 as const,
            priceLineVisible: false,
            lastValueVisible: pane,
            crosshairMarkerVisible: false,
            ...(pane
                ? {
                      title: `${entry.label} ${config.period}`,
                  }
                : {}),
            ...(config.type === "rsi"
                ? {
                      priceFormat: {
                          type: "price" as const,
                          precision: 1,
                          minMove: 0.1,
                      },
                  }
                : {}),
        }),
        [config.color, config.period, config.type, entry.label, pane],
    );

    const referenceOptions = useMemo(
        () => ({
            color: "#5A6476",
            lineWidth: 1 as const,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: "",
        }),
        [],
    );

    return (
        <LineSeries data={data} options={options}>
            {referenceLines?.map((price) => (
                <PriceLine
                    key={price}
                    price={price}
                    options={referenceOptions}
                />
            ))}
        </LineSeries>
    );
}
