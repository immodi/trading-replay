import type { IndicatorType } from "@/types/indicator";

type IndicatorCatalogEntry = {
    type: IndicatorType;
    label: string;
    defaultPeriod: number;
};

export const INDICATOR_CATALOG = [
    { type: "ema", label: "EMA", defaultPeriod: 14 },
    { type: "sma", label: "SMA", defaultPeriod: 20 },
    { type: "vwap", label: "VWAP", defaultPeriod: 0 },
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
