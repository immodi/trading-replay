import { Timeframes } from "./toolbar";

/**
 * Market family of a dataset. It only changes presentation and defaults; the
 * replay/backtest engines work with price points and a per-unit point value,
 * so a stock is simply an instrument whose point value is the currency value
 * of one price unit (normally 1).
 */
export type AssetClass = "futures" | "stock";

export type AssetClassDefinition = {
    value: AssetClass;
    label: string;
    description: string;
    /** Default currency value of one point (per share for stocks). */
    defaultPointValue: number;
    /** Default raw data resolution, in minutes. */
    defaultBaseTimeframeMinutes: number;
    /** Singular unit used in order forms and result tables. */
    quantityLabel: string;
    /** Plural unit used in headings and hints. */
    quantityLabelPlural: string;
};

export const ASSET_CLASSES = [
    {
        value: "futures",
        label: "Futures",
        description:
            "Contract markets. Point value is the dollar value of one index/price point per contract.",
        defaultPointValue: 0,
        defaultBaseTimeframeMinutes: 1,
        quantityLabel: "contract",
        quantityLabelPlural: "contracts",
    },
    {
        value: "stock",
        label: "Stocks",
        description:
            "Cash equities. Point value is normally 1, so P/L is price change × quantity (shares).",
        defaultPointValue: 1,
        defaultBaseTimeframeMinutes: 1440,
        quantityLabel: "share",
        quantityLabelPlural: "shares",
    },
] as const satisfies readonly AssetClassDefinition[];

export const DEFAULT_ASSET_CLASS: AssetClass = "futures";

export const DEFAULT_CURRENCY = "USD";

/** Accept short currency codes such as USD, EGP, EUR; default to USD. */
export function normaliseCurrency(value: unknown): string {
    if (typeof value !== "string") return DEFAULT_CURRENCY;

    const currency = value.trim().toUpperCase();
    return /^[A-Z]{3,5}$/.test(currency) ? currency : DEFAULT_CURRENCY;
}

export const DAILY_TIMEFRAME_MINUTES = 1440;

/**
 * Raw resolutions the source form can describe. The loader can technically
 * handle any positive minute value; these are the supported import presets.
 */
export const BASE_TIMEFRAME_OPTIONS = [
    { value: 1, label: "1-minute bars", shortLabel: "1m" },
    { value: DAILY_TIMEFRAME_MINUTES, label: "Daily bars", shortLabel: "1D" },
] as const;

export function isAssetClass(value: unknown): value is AssetClass {
    return value === "futures" || value === "stock";
}

export function normaliseAssetClass(value: unknown): AssetClass {
    return isAssetClass(value) ? value : DEFAULT_ASSET_CLASS;
}

export function assetClassDefinition(
    value: AssetClass | undefined,
): AssetClassDefinition {
    const assetClass = normaliseAssetClass(value);
    return (
        ASSET_CLASSES.find((entry) => entry.value === assetClass) ??
        ASSET_CLASSES[0]
    );
}

export function normaliseBaseTimeframe(
    value: unknown,
    assetClass: AssetClass,
): number {
    if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 1
    ) {
        return Math.floor(value);
    }

    return assetClassDefinition(assetClass).defaultBaseTimeframeMinutes;
}

/** Base resolution of a source, including legacy configs without the field. */
export function resolveBaseTimeframe(config: {
    assetClass?: unknown;
    baseTimeframeMinutes?: unknown;
}): number {
    const assetClass = normaliseAssetClass(config.assetClass);
    return normaliseBaseTimeframe(config.baseTimeframeMinutes, assetClass);
}

/**
 * Chart/backtest timeframes that can be produced from a base resolution.
 * A timeframe must be a multiple of the base so every aggregate contains a
 * whole number of source bars.
 */
export function availableTimeframes(
    baseTimeframeMinutes: number,
): readonly (typeof Timeframes)[number][] {
    const base = Math.max(1, Math.floor(baseTimeframeMinutes));
    return Timeframes.filter(
        (timeframe) =>
            timeframe.value >= base &&
            timeframe.value % base === 0 &&
            (!("minBaseTimeframeMinutes" in timeframe) ||
                base >= timeframe.minBaseTimeframeMinutes),
    );
}

/** Clamp a requested timeframe to one the source can actually produce. */
export function normaliseTimeframe(
    timeframeMinutes: number,
    baseTimeframeMinutes: number,
): number {
    const options = availableTimeframes(baseTimeframeMinutes);

    if (options.length === 0) {
        return Math.max(1, Math.floor(baseTimeframeMinutes));
    }

    const requested = Number.isFinite(timeframeMinutes)
        ? timeframeMinutes
        : options[0].value;

    const exact = options.find((option) => option.value === requested);
    if (exact) return exact.value;

    const next = options.find((option) => option.value >= requested);
    return (next ?? options[options.length - 1]).value;
}

export function timeframeLabel(timeframeMinutes: number): string {
    return (
        Timeframes.find(
            (timeframe) => timeframe.value === timeframeMinutes,
        )?.label ?? `${timeframeMinutes} Minutes`
    );
}
