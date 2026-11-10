export type IndicatorType =
    | "vwap"
    | "vwap-bands"
    | "ema"
    | "sma"
    | "rsi"
    | "atr"
    | "adx";

export type IndicatorLineWidth = 1 | 2 | 3 | 4;
export type IndicatorLineStyle = "solid" | "dashed" | "dotted";
export type IndicatorBandCount = 1 | 2 | 3;

/**
 * One configured chart overlay. Several instances of the same `type` may
 * coexist, so `id` is the stable identity shared by the chart and the UI.
 */
export type IndicatorConfig = {
    id: string;
    type: IndicatorType;
    enabled: boolean;
    color: string;
    /** Lookback for EMA/SMA/RSI/ATR. Unused by VWAP indicators. */
    period: number;
    lineWidth: IndicatorLineWidth;
    lineStyle: IndicatorLineStyle;
    /** Number of standard-deviation bands on each side. VWAP bands only. */
    bandCount: IndicatorBandCount;
};
