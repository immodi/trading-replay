import type {
    IndicatorBandCount,
    IndicatorLineStyle,
    IndicatorLineWidth,
    IndicatorType,
} from "@/types/indicator";

export type IndicatorPlacement = "overlay" | "pane";

type IndicatorCatalogEntry = {
    type: IndicatorType;
    label: string;
    defaultPeriod: number;
    placement: IndicatorPlacement;
};

export const INDICATOR_CATALOG = [
    { type: "ema", label: "EMA", defaultPeriod: 14, placement: "overlay" },
    { type: "sma", label: "SMA", defaultPeriod: 20, placement: "overlay" },
    { type: "vwap", label: "VWAP", defaultPeriod: 0, placement: "overlay" },
    {
        type: "vwap-bands",
        label: "VWAP Bands",
        defaultPeriod: 0,
        placement: "overlay",
    },
    { type: "rsi", label: "RSI", defaultPeriod: 14, placement: "pane" },
    { type: "atr", label: "ATR", defaultPeriod: 14, placement: "pane" },
] as const satisfies readonly IndicatorCatalogEntry[];

export const INDICATOR_LINE_WIDTHS = [
    1, 2, 3, 4,
] as const satisfies readonly IndicatorLineWidth[];

export const INDICATOR_LINE_STYLES = [
    "solid",
    "dashed",
    "dotted",
] as const satisfies readonly IndicatorLineStyle[];

export const INDICATOR_LINE_STYLE_LABELS: Record<
    IndicatorLineStyle,
    string
> = {
    solid: "Solid",
    dashed: "Dashed",
    dotted: "Dotted",
};

export const DEFAULT_INDICATOR_LINE_WIDTH: IndicatorLineWidth = 2;
export const DEFAULT_INDICATOR_LINE_STYLE: IndicatorLineStyle = "solid";

export const INDICATOR_BAND_COUNTS = [
    1, 2, 3,
] as const satisfies readonly IndicatorBandCount[];

export const DEFAULT_INDICATOR_BAND_COUNT: IndicatorBandCount = 3;

/** Distinct overlay colours, used in order when new instances are added. */
export const INDICATOR_COLORS = [
    "#FFD93D",
    "#6BCB77",
    "#FF6B6B",
    "#4D96FF",
    "#C77DFF",
    "#FF9F45",
    "#2EC4B6",
    "#F15BB5",
] as const;

export function indicatorCatalogEntry(type: IndicatorType): IndicatorCatalogEntry {
    return (
        INDICATOR_CATALOG.find((entry) => entry.type === type) ??
        INDICATOR_CATALOG[0]
    );
}

export function indicatorPlacement(type: IndicatorType): IndicatorPlacement {
    return indicatorCatalogEntry(type).placement;
}
