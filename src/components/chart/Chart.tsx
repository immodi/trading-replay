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
import { ReplayToolbar, type ReplayToolbarProps } from "../toolbar/ReplayToolbar";
import { useMemo, useRef, useState } from "react";
import { ChartSpeed } from "@/constants/chart";
import { Timeframe } from "@/constants/toolbar";
import { usePrice } from "@/hooks/usePrice";
import { useTrade } from "@/hooks/useTrade";
import { useTradingSession } from "@/hooks/useTradingSession";
import { ChartTrading } from "./ChartTrading";
import type { PositionParamters } from "@/types/positionParamters";
import type { IndicatorSettings } from "@/types/indicator";
import { useIndicators } from "@/hooks/useIndicators";
import { useCurrentDataSource } from "@/hooks/useCurrentDataSource";
import type { CandleSourceConfig } from "@/types/candleSource";
import { createCandleSource } from "@/data/sources/candleSource";

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

type ChartComponentProps = {
    config: CandleSourceConfig
};

export function ChartComponent({ config }: ChartComponentProps) {
    const [timeFrameMinutes, setTimeFrameMinutes] = useState(Timeframe.Minute15 as number);
    const [speed, setSpeed] = useState(ChartSpeed.X1 as number);
    const [orderMenu, setOrderMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [seriesApi, setSeriesApi] = useState<
        ISeriesApi<"Candlestick", UTCTimestamp> | null
    >(null);

    const [indicatorSettings, setIndicatorSettings] =
        useState<IndicatorSettings>({
            vwap: { enabled: false, color: "#FF6B6B" },
            ema: { enabled: false, color: "#FFD93D", period: 14 },
            sma: { enabled: false, color: "#6BCB77", period: 20 },
        });
    const positionParametersRef = useRef<PositionParamters>({
        takeProfitPoints: 20,
        stopLossPoints: 20,
        quantity: 1,
        bracket: true,
    });

    // Must stay referentially stable: useCurrentDataSource keys its effects on
    // this object, so recreating it each render causes an infinite update loop.
    const candleSource = useMemo(() => createCandleSource(config), [config]);
    const source = useCurrentDataSource(
        timeFrameMinutes,
        candleSource
    )

    const replay = useReplay(timeFrameMinutes, speed, source.candleData, source.aggregatedCandleHistory);
    const fullPriceData = usePrice(replay.candles);
    const sessionPriceData = usePrice(replay.sessionCandles);
    const trade = useTrade(fullPriceData, source.pointValue, source.commission);
    const session = useTradingSession({
        positions: trade.positions,
        instrument: config.symbol,
        pointValue: source.pointValue,
        commissionPerSide: source.commission,
    });


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

    const setChartDate = (date: Date) => {
        source.setCurrentDate(date);
        trade.reset();
        return;
    };

    const handleIndicatorChange = (newSettings: IndicatorSettings) => {
        setIndicatorSettings(newSettings)
    };

    const {
        handleChartInit,
        showGoToLatest,
        chartRef,
        goToLatest,
    } = useGoToLatest();

    const { reset: resetIndicators } = useIndicators({
        chartApi: chartRef.current,
        fullPriceData,
        sessionPriceData,
        settings: indicatorSettings,
    });


    if (source.error) {
        return (
            <div className="flex w-screen h-screen items-center justify-center bg-[#131722] text-red-400">
                Failed to load market data: {source.error.message}
            </div>
        );
    }

    if (!source.dataRange || !source.candleData) {
        return (
            <div className="flex w-screen h-screen items-center justify-center bg-[#131722] text-gray-300">
                Loading historical data...
            </div>
        );
    }

    const replayToolbarProps: ReplayToolbarProps = {
        minDate: source.dataRange.start,
        maxDate: source.dataRange.end,
        positionParametersRef: positionParametersRef,
        priceData: fullPriceData,
        seriesApi: seriesApi,
        chartApi: chartRef.current,
        indicatorSettings: indicatorSettings,

        isPlaying: replay.isPlaying,
        direction: replay.direction,
        pl: trade.pl,
        isDone: replay.isDone,

        setSpeed: setChartSpeed,
        setIndicatorSettings: handleIndicatorChange,
        setTimeFrame: setTimeFrame,
        setChartDate: setChartDate,

        reset: () => {
            trade.reset();
            resetIndicators();
        },
        stop: replay.stop,
        start: replay.start,
        playback: replay.playback,
        restart: replay.restart,
        enter: trade.enter,
        close: trade.close,
        closeAll: trade.closeAll,

        sessionInstrument: config.symbol,
        sessionTrades: session.trades,
        sessionSummary: session.summary,
        sessionHasUnexportedChanges: session.hasUnexportedChanges,
        removeSessionTrade: session.removeTrade,
        exportSession: session.exportSession,
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
                            positionParamtersRef={positionParametersRef}
                            seriesApi={seriesApi}
                            chartApi={chartRef.current}
                            orderMenu={orderMenu}
                            enter={trade.enter}
                            close={trade.close}
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
