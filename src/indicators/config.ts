import {
    INDICATOR_COLORS,
    indicatorCatalogEntry,
} from "@/constants/indicators";
import type { IndicatorConfig, IndicatorType } from "@/types/indicator";

let fallbackId = 0;

function createIndicatorId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    fallbackId += 1;
    return `indicator-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

function nextColor(indicators: IndicatorConfig[]): string {
    const used = new Set(indicators.map((indicator) => indicator.color.toLowerCase()));
    const available = INDICATOR_COLORS.find(
        (color) => !used.has(color.toLowerCase()),
    );

    return available ?? INDICATOR_COLORS[indicators.length % INDICATOR_COLORS.length];
}

/** Create a visible indicator instance, colouring it apart from the others. */
export function createIndicator(
    type: IndicatorType,
    existing: IndicatorConfig[],
): IndicatorConfig {
    const entry = indicatorCatalogEntry(type);

    return {
        id: createIndicatorId(),
        type,
        enabled: true,
        color: nextColor(existing),
        period: entry.defaultPeriod,
        multiplier: entry.defaultMultiplier ?? 2,
    };
}
