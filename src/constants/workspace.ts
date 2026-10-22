import { ChartSpeed } from "@/constants/chart";
import { Timeframe } from "@/constants/toolbar";
import type { IndicatorSettings } from "@/types/indicator";
import type { PositionParamters } from "@/types/positionParamters";

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
    vwap: { enabled: false, color: "#FF6B6B" },
    ema: { enabled: false, color: "#FFD93D", period: 14 },
    sma: { enabled: false, color: "#6BCB77", period: 20 },
};

export const DEFAULT_POSITION_PARAMETERS: PositionParamters = {
    takeProfitPoints: 20,
    stopLossPoints: 20,
    quantity: 1,
    bracket: true,
};

export const DEFAULT_TIMEFRAME_MINUTES: number = Timeframe.Minute15;
export const DEFAULT_CHART_SPEED: number = ChartSpeed.X1;

/**
 * A fresh view configuration. Nested objects are cloned because the UI keeps
 * position parameters in a mutable ref.
 */
export function createDefaultView() {
    return {
        timeframeMinutes: DEFAULT_TIMEFRAME_MINUTES,
        speed: DEFAULT_CHART_SPEED,
        indicatorSettings: {
            vwap: { ...DEFAULT_INDICATOR_SETTINGS.vwap },
            ema: { ...DEFAULT_INDICATOR_SETTINGS.ema },
            sma: { ...DEFAULT_INDICATOR_SETTINGS.sma },
        },
        positionParameters: { ...DEFAULT_POSITION_PARAMETERS },
    };
}
