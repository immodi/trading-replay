import { useEffect, useMemo, useRef, useState } from "react";

import { generateCandles, type Candle } from "@/data/generateCandles";

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
import getCandleWindow from "@/utils/getCandleWindow";
import { aggregateCandle } from "@/utils/aggregateCandle";

const candleData = generateCandles(100 * 60);

interface ReplayState {
    windowIndex: number;
}

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
    // Engine state (does not trigger renders)
    const replay = useRef<ReplayState>({
        windowIndex: 0,
        // candle: null
    });

    // UI state
    const [candles, setCandles] = useState<Candle[]>([]);

    const visibleVolume = useMemo(
        () =>
            candles.map(candle => ({
                time: candle.time,
                value: candle.volume,
                color:
                    candle.close >= candle.open
                        ? "#26a69a"
                        : "#ef5350",
            })),
        [candles]
    );

    useEffect(() => {
        const id = setInterval(() => {
            const state = replay.current;

            const candleWindow = getCandleWindow(candleData, state.windowIndex, timerMin)
            if (candleWindow.length === 0) {
                return;
            }
            let currentCandle = candleWindow[0]

            const timeFrameCandles = candleWindow.slice(1)
            timeFrameCandles.forEach((candle, index) => {
                setTimeout(() => {
                    currentCandle = aggregateCandle(currentCandle, candle);
                    setCandles(prev => {
                        const next = [...prev];
                        next[next.length - 1] = currentCandle;
                        return next;
                    });
                }, (index + 1) * 1000);
            })


            // Advance engine synchronously
            state.windowIndex++;
            setCandles(prev => [...prev, currentCandle]);

        }, timerMin * 1000);

        return () => clearInterval(id);
    }, []);

    return (
        <div className="w-3/4 h-3/4">
            <Chart
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
                        data={visibleVolume}
                        options={{
                            priceFormat: {
                                type: "volume",
                            },
                        }}
                    />
                </Pane>
            </Chart>
        </div>
    );
}
