import { ChartSpeed } from "@/constants/chart";
import { DEFAULT_CHART_TIMEZONE } from "@/constants/timezone";
import { Timeframe } from "@/constants/toolbar";
import type { IndicatorConfig } from "@/types/indicator";
import type { PositionParamters } from "@/types/positionParamters";

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
        chartTimezone: DEFAULT_CHART_TIMEZONE,
        activeStrategyPanel: "fade",
        indicators: [] as IndicatorConfig[],
        positionParameters: { ...DEFAULT_POSITION_PARAMETERS },
    };
}
