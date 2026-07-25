import {
    ColorType,
    CrosshairMode,
    LineStyle,
    type ChartOptions,
    type DeepPartial,
    type ISeriesApi,
    type UTCTimestamp,
} from "lightweight-charts";

import {
    CandlestickSeries,
    Chart,
    HistogramSeries,
    Pane,
    type SeriesApiRef,
} from "lightweight-charts-react-components";

import { useReplay } from "@/hooks/useReplay";
import { useGoToLatest } from "@/hooks/useGoToLatest";

import { GoToLatestButton } from "./GoToLatestButton";

import { Color } from "@/constants/replay";
import { ReplayToolbar } from "../toolbar/ReplayToolbar";
import { useEffect, useRef, useState } from "react";
import { ChartSpeed } from "@/constants/chart";
import { Timeframe } from "@/constants/toolbar";
import type { Candle } from "@/types/candle";
import type { DataRange } from "@/types/dateRange";
import { getContinuousMnqRange, loadContinuousMnq } from "@/data/mnq";
import { usePrice } from "@/hooks/usePrice";
import { useTrade } from "@/hooks/useTrade";
import { MNQ_POINT_DOLLAR_VALUE } from "@/constants/mnq";
import { ChartTrading } from "./ChartTrading";
import type { PositionParamters } from "@/types/positionParamters";

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
    const [orderMenu, setOrderMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [seriesApi, setSeriesApi] = useState<
        ISeriesApi<"Candlestick", UTCTimestamp> | null
    >(null);

    const [dataRange, setDataRange] = useState<DataRange | null>(null);
    const [candleData, setCandleData] = useState<Candle[] | null>(null);
    const positionParametersRef = useRef<PositionParamters>({
        takeProfitPoints: 20,
        stopLossPoints: 20,
    });
    const replay = useReplay(timeFrameMinutes, speed, candleData);
    const priceData = usePrice(replay.candles);
    const trade = useTrade(priceData, MNQ_POINT_DOLLAR_VALUE);

    useEffect(() => {
        async function load() {
            const dataRange = await getContinuousMnqRange();
            setDataRange(dataRange);

            const candleData = await loadContinuousMnq(dataRange.start);
            setCandleData(candleData);
        }

        load();
    }, []);

    const handleSeriesInit = (
        ref: SeriesApiRef<"Candlestick", UTCTimestamp> | null,
    ) => {
        if (ref) {
            setSeriesApi(ref._series);
        } else {
            setSeriesApi(null);
        }
    };

    const handleContextMenu = (
        event: React.MouseEvent<HTMLDivElement>,
    ) => {
        event.preventDefault();

        setOrderMenu({
            x: event.clientX,
            y: event.clientY,
        });
    };

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
        return;
    };

    const {
        handleChartInit,
        showGoToLatest,
        chartRef,
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
        positionParametersRef: positionParametersRef,
        price: priceData.Price,

        isPlaying: replay.isPlaying,
        direction: replay.direction,
        pl: trade.pl,
        isDone: replay.isDone,

        setSpeed: setChartSpeed,
        setTimeFrame: setTimeFrame,

        resetPl: trade.resetPL,
        setCandleData: setChartData,
        stop: replay.stop,
        start: replay.start,
        playback: replay.playback,
        restart: replay.restart,
        enter: trade.enter,
        close: trade.close
    };

    return (
        <div
            onContextMenu={handleContextMenu}
            onClick={() => setOrderMenu(null)}
            className="flex h-dvh w-full flex-col overflow-hidden bg-[#131722]"
        >
            <ReplayToolbar {...replayToolbarProps} />

            <div className="min-h-0 flex-1 p-2">
                <div className="relative h-full w-full  overflow-hidden rounded-md border border-[#363A45]">
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
                                ref={handleSeriesInit}
                                data={replay.candles}
                                options={{
                                    priceLineStyle: LineStyle.Dashed,
                                    priceLineWidth: 2,
                                }}
                            />
                        </Pane>

                        <Pane stretchFactor={1}>
                            <HistogramSeries
                                data={replay.volume}
                                options={{
                                    priceFormat: {
                                        type: "volume",
                                    },
                                }}
                            />
                        </Pane>
                    </Chart>


                    {seriesApi && chartRef.current && (
                        <ChartTrading
                            positions={trade.positions}
                            seriesApi={seriesApi}
                            positionParamtersRef={positionParametersRef}
                            chartApi={chartRef.current}
                            orderMenu={orderMenu}
                            enter={trade.enter}
                            onClose={() => setOrderMenu(null)}
                        />
                    )}

                    <GoToLatestButton
                        visible={showGoToLatest}
                        onClick={goToLatest}
                    />
                </div>
            </div>
        </div>
    );
}
