import { useMemo } from "react";
import {
    LineStyle,
    type LineData,
    type LineWidth,
    type UTCTimestamp,
} from "lightweight-charts";
import { LineSeries, PriceLine } from "lightweight-charts-react-components";

import { indicatorCatalogEntry } from "@/constants/indicators";
import type {
    IndicatorConfig,
    IndicatorLineStyle,
} from "@/types/indicator";

const LINE_STYLE_MAP: Record<IndicatorLineStyle, LineStyle> = {
    solid: LineStyle.Solid,
    dashed: LineStyle.Dashed,
    dotted: LineStyle.Dotted,
};

type IndicatorSeriesProps = {
    config: IndicatorConfig;
    data: LineData<UTCTimestamp>[];
    pane?: boolean;
    referenceLines?: number[];
    color?: string;
    lineWidth?: LineWidth;
    lineStyle?: LineStyle;
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
    color,
    lineWidth,
    lineStyle,
}: IndicatorSeriesProps) {
    const entry = indicatorCatalogEntry(config.type);

    const options = useMemo(
        () => ({
            color: color ?? config.color,
            lineWidth: lineWidth ?? config.lineWidth,
            lineStyle: lineStyle ?? LINE_STYLE_MAP[config.lineStyle],
            priceLineVisible: false,
            lastValueVisible: pane,
            crosshairMarkerVisible: false,
            ...(pane
                ? {
                      title: `${entry.label} ${config.period}`,
                  }
                : {}),
            ...(config.type === "rsi" || config.type === "adx"
                ? {
                      priceFormat: {
                          type: "price" as const,
                          precision: 1,
                          minMove: 0.1,
                      },
                  }
                : {}),
        }),
        [
            color,
            config.color,
            config.lineStyle,
            config.lineWidth,
            config.period,
            config.type,
            entry.label,
            lineStyle,
            lineWidth,
            pane,
        ],
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
