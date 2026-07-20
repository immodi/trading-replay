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

import { Color } from "@/constants/replay";
import { ReplayToolbar } from "../toolbar/ReplayToolbar";
import { useEffect, useState } from "react";
import { ChartSpeed } from "@/constants/chart";
import { Timeframe } from "@/constants/toolbar";
import type { Candle } from "@/types/candle";
import type { DataRange } from "@/types/dateRange";
import { getContinuousMnqRange, loadContinuousMnq } from "@/data/mnq";

const chartOptions: DeepPartial<ChartOptions> = {
    layout: {
        background: {
            type: ColorType.Solid,
            color: Color.Background,
        },
        textColor: Color.Text,
        attributionLogo: false,
    },

    grid: {
        vertLines: {
            visible: true,
            color: Color.Grid,
        },
        horzLines: {
            visible: true,
            color: Color.Grid,
        },
    },

    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    },

    crosshair: {
        mode: CrosshairMode.Normal,
    },
};

export function ChartComponent() {
    const [timeFrameMinutes, setTimeFrameMinutes] = useState(Timeframe.Minute15 as number); // 15min
    const [speed, setSpeed] = useState(ChartSpeed.X1 as number);

    const [dataRange, setDataRange] = useState<DataRange | null>(null);
    const [candleData, setCandleData] = useState<Candle[] | null>(null);
    const { candles, volume, direction, isPlaying, isDone, start, stop, playback, restart } = useReplay(timeFrameMinutes, speed, candleData);

    useEffect(() => {
        async function load() {
            const dataRange = await getContinuousMnqRange();
            setDataRange(dataRange);

            const candleData = await loadContinuousMnq(dataRange.start);
            setCandleData(candleData);
        }

        load();
    }, []);

    useEffect(() => {
        console.log(candleData);
    }, [candleData])

    const setTimeFrame = (timeFrameInMinutes: number) => {
        setTimeFrameMinutes(timeFrameInMinutes);
        return;
    };

    const setChartSpeed = (chartSpeed: number) => {
        setSpeed(chartSpeed);
        return;
    };

    const setChartData = (data: Candle[]) => {
        setCandleData(data);
    };


    const {
        handleChartInit,
        showGoToLatest,
        goToLatest,
    } = useGoToLatest();


    if (!dataRange || !candleData) {
        return (
            <div className="flex w-screen h-screen items-center justify-center bg-[#131722] text-gray-300">
                Loading historical data...
            </div>
        );
    }

    const replayToolbarProps = {
        minDate: dataRange.start,
        maxDate: dataRange.end,

        isPlaying: isPlaying,
        direction: direction,
        isDone: isDone,

        setSpeed: setChartSpeed,
        setTimeFrame: setTimeFrame,

        setCandleData: setChartData,
        start: start,
        stop: stop,
        playback: playback,
        restart: restart,
    };

    return (
        <div className="flex h-screen w-screen flex-col bg-[#131722]">
            <ReplayToolbar {...replayToolbarProps} />

            <div className="flex-1 p-2">
                <div className="relative h-full w-full overflow-hidden rounded-md border border-[#363A45]">
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
            </div>
        </div>
    );
}
