export type IndicatorType = "vwap" | "ema" | "sma";

/**
 * One configured chart overlay. Several instances of the same `type` may
 * coexist, so `id` is the stable identity shared by the chart and the UI.
 */
export type IndicatorConfig = {
    id: string;
    type: IndicatorType;
    enabled: boolean;
    color: string;
    /** Lookback for EMA/SMA. Unused by VWAP. */
    period: number;
};
