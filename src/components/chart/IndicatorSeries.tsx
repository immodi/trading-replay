import { useMemo } from "react";
import type { LineData, UTCTimestamp } from "lightweight-charts";
import { LineSeries } from "lightweight-charts-react-components";

import type { IndicatorConfig } from "@/types/indicator";

type IndicatorSeriesProps = {
    config: IndicatorConfig;
    data: LineData<UTCTimestamp>[];
};

/**
 * One declarative overlay series. The options object is memoised so changing
 * replay data does not re-apply series options on every tick.
 */
export function IndicatorSeries({ config, data }: IndicatorSeriesProps) {
    const options = useMemo(
        () => ({
            color: config.color,
            lineWidth: 2 as const,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        }),
        [config.color],
    );

    return <LineSeries data={data} options={options} />;
}
