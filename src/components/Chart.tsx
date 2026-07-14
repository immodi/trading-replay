import {
    ColorType,
    CrosshairMode,
    LineStyle,
    type ChartOptions,
    type DeepPartial,
} from "lightweight-charts";

import {
    CandlestickSeries,
    Chart,
    HistogramSeries,
    Pane,
} from "lightweight-charts-react-components";
import { useReplay } from "@/hooks/useReplay";
import { useGoToLatest } from "@/hooks/useGoToLatest";
import { GoToLatestButton } from "./GoToLatestButton";

const chartOptions: DeepPartial<ChartOptions> = {
    layout: {
        background: {
            type: ColorType.Solid,
            color: "#ffffff",
        },
        textColor: "#000000",
        attributionLogo: false,
    },
    grid: {
        vertLines: {
            visible: true,
            color: "#e5e7eb",
        },
        horzLines: {
            visible: true,
            color: "#e5e7eb",
        },
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    },
    crosshair: {
        mode: CrosshairMode.MagnetOHLC,
    },
};

export function ChartComponent(
    { timerMin = 3 }: { timerMin?: number }
) {
    const { candles, volume } = useReplay(timerMin);
    const {
        handleChartInit,
        showGoToLatest,
        goToLatest,
    } = useGoToLatest();

    return (
        <div className="relative w-3/4 h-3/4">
            <Chart
                onInit={handleChartInit}
                options={chartOptions}
                containerProps={{
                    style: {
                        width: "100%",
                        height: "100%",
                    },
                }}
            >
                <Pane stretchFactor={4}>
                    <CandlestickSeries
                        data={candles}
                        options={{
                            priceLineStyle: LineStyle.Dashed,
                            priceLineWidth: 2,
                        }}
                    />
                </Pane>

                <Pane stretchFactor={1}>
                    <HistogramSeries
                        data={volume}
                        options={{
                            priceFormat: {
                                type: "volume",
                            },
                        }}
                    />
                </Pane>
            </Chart>

            <GoToLatestButton
                visible={showGoToLatest}
                onClick={goToLatest}
            />
        </div>
    );
}
