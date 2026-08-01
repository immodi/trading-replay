export type IndicatorType = "vwap" | "ema" | "sma";

export type IndicatorSettings = {
    vwap: { enabled: boolean; color: string };
    ema: { enabled: boolean; color: string; period: number };
    sma: { enabled: boolean; color: string; period: number };
};
