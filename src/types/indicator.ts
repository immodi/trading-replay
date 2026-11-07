export type IndicatorType =
    | "vwap"
    | "vwap-bands"
    | "ema"
    | "sma"
    | "rsi"
    | "atr";

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
    /** Band width in standard deviations. Only used by VWAP bands. */
    multiplier: number;
};
