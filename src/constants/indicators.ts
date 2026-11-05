import type { IndicatorType } from "@/types/indicator";

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
    { type: "rsi", label: "RSI", defaultPeriod: 14, placement: "pane" },
    { type: "atr", label: "ATR", defaultPeriod: 14, placement: "pane" },
] as const satisfies readonly IndicatorCatalogEntry[];

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
