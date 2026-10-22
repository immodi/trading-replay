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
import { LineEditToggle } from "./LineEditToggle";
import { MarketHeader } from "./MarketHeader";

import { Color } from "@/constants/replay";
import { ReplayToolbar, type ReplayToolbarProps } from "../toolbar/ReplayToolbar";
import { TradingBar } from "../toolbar/TradingBar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrice } from "@/hooks/usePrice";
import { useStore } from "@/hooks/useStore";
import { useTrade } from "@/hooks/useTrade";
import { useTradingSession } from "@/hooks/useTradingSession";
import { getSessionStore } from "@/store/sessionStore";
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
        textColor: Color.MutedText,
        fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        attributionLogo: false,
        panes: {
            separatorColor: Color.Border,
            separatorHoverColor: "rgba(61, 126, 255, 0.35)",
            enableResize: true,
        },
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

    crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
            color: "#4A5568",
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: "#2A3344",
        },
        horzLine: {
            color: "#4A5568",
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: "#2A3344",
        },
    },

    rightPriceScale: {
        borderColor: Color.Border,
        scaleMargins: {
            top: 0.1,
            bottom: 0.1,
        },
    },

    timeScale: {
        borderColor: Color.Border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
    },
};

type ChartComponentProps = {
    config: CandleSourceConfig
};

export function ChartComponent({ config }: ChartComponentProps) {
    // One singleton store per stored source: trades, positions, playback and
    // view preferences all live here and are mirrored to localStorage.
    const sessionStore = useMemo(
        () => getSessionStore(config.id, config.symbol),
        [config.id, config.symbol],
    );
    const persisted = useStore(sessionStore);

    const [timeFrameMinutes, setTimeFrameMinutes] = useState<number>(
        () => persisted.view.timeframeMinutes,
    );
    const [speed, setSpeed] = useState<number>(() => persisted.view.speed);
    const [orderMenu, setOrderMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [lineEditMode, setLineEditMode] = useState(false);
    const [seriesApi, setSeriesApi] = useState<
        ISeriesApi<"Candlestick", UTCTimestamp> | null
    >(null);

    const [indicatorSettings, setIndicatorSettings] =
        useState<IndicatorSettings>(() => persisted.view.indicatorSettings);
    const positionParametersRef = useRef<PositionParamters>(
        persisted.view.positionParameters,
    );

    // Read once: these are "what to restore" values, not live state.
    const initialDateRef = useRef<Date | null>(
        persisted.playback.date ? new Date(persisted.playback.date) : null,
    );
    const hasPersistedPlaybackRef = useRef(
        persisted.playback.date !== "",
    );

    // Must stay referentially stable: useCurrentDataSource keys its effects on
    // this object, so recreating it each render causes an infinite update loop.
    const candleSource = useMemo(() => createCandleSource(config), [config]);
    const source = useCurrentDataSource(
        timeFrameMinutes,
        candleSource,
        initialDateRef.current,
    );

    const replay = useReplay(
        timeFrameMinutes,
        speed,
        source.candleData,
        source.aggregatedCandleHistory,
        {
            restoreIndex: hasPersistedPlaybackRef.current
                ? persisted.playback.index
                : undefined,
            restoreDirection: persisted.playback.direction,
            restoreReady: !source.isHistoryLoading,
        },
    );
    const fullPriceData = usePrice(replay.candles);
    const sessionPriceData = usePrice(replay.sessionCandles);
    const trade = useTrade(
        fullPriceData,
        source.pointValue,
        source.commission,
        persisted.positions,
        replay.hasRestored,
    );
    const session = useTradingSession({
        positions: trade.positions,
        instrument: config.symbol,
        pointValue: source.pointValue,
        commissionPerSide: source.commission,
        store: sessionStore,
    });

    const positionsSignature = useMemo(
        () => JSON.stringify(trade.positions),
        [trade.positions],
    );
    const lastPositionsSignatureRef = useRef<string | null>(null);

    // Persist the opening state immediately: a session exists before the user
    // places an order or changes any setting.
    useEffect(() => {
        sessionStore.save();
    }, [sessionStore]);

    // Mirror engine state back into the store. Positions are only written when
    // their content changes: the trade engine returns a new array on every
    // replay tick, even when no order moved.
    useEffect(() => {
        if (lastPositionsSignatureRef.current === positionsSignature) return;
        lastPositionsSignatureRef.current = positionsSignature;

        if (sessionStore.get().positions === trade.positions) return;

        sessionStore.patch({
            positions: trade.positions,
            updatedAt: Date.now(),
        });
        sessionStore.save();
    }, [positionsSignature, trade.positions, sessionStore]);

    useEffect(() => {
        const current = sessionStore.get().view;
        if (
            current.timeframeMinutes === timeFrameMinutes &&
            current.speed === speed &&
            current.indicatorSettings === indicatorSettings
        ) {
            return;
        }

        sessionStore.patch({
            view: {
                ...current,
                timeframeMinutes: timeFrameMinutes,
                speed,
                indicatorSettings,
            },
            updatedAt: Date.now(),
        });
        sessionStore.save();
    }, [timeFrameMinutes, speed, indicatorSettings, sessionStore]);

    useEffect(() => {
        if (!replay.hasRestored || !source.currentDate) return;

        sessionStore.patch({
            playback: {
                date: source.currentDate.toISOString(),
                index: replay.index,
                direction: replay.direction,
                isPlaying: replay.isPlaying,
            },
            updatedAt: Date.now(),
        });
    }, [
        replay.hasRestored,
        replay.index,
        replay.direction,
        replay.isPlaying,
        source.currentDate,
        sessionStore,
    ]);

    // Position parameters live in a mutable ref (the chart editors write into
    // it directly), so persistence is explicit instead of state-driven.
    const persistPositionParameters = useCallback(() => {
        const current = sessionStore.get();

        sessionStore.patch({
            view: {
                ...current.view,
                positionParameters: { ...positionParametersRef.current },
            },
            updatedAt: Date.now(),
        });
        sessionStore.save();
    }, [sessionStore]);


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

        const current = sessionStore.get();
        sessionStore.patch({
            view: { ...current.view, timeframeMinutes: timeFrameInMinutes },
            updatedAt: Date.now(),
        });
        sessionStore.save();
    };

    const setChartSpeed = (chartSpeed: number) => {
        setSpeed(chartSpeed);

        const current = sessionStore.get();
        sessionStore.patch({
            view: { ...current.view, speed: chartSpeed },
            updatedAt: Date.now(),
        });
        sessionStore.save();
    };

    const setChartDate = (date: Date) => {
        source.setCurrentDate(date);

        // Park the persisted replay at the start of the new day so an
        // immediate refresh cannot restore an out-of-range index.
        const current = sessionStore.get();
        sessionStore.patch({
            playback: {
                ...current.playback,
                date: date.toISOString(),
                index: 0,
            },
            updatedAt: Date.now(),
        });
        sessionStore.save();

        trade.reset();
    };

    const handleIndicatorChange = (newSettings: IndicatorSettings) => {
        setIndicatorSettings(newSettings);

        const current = sessionStore.get();
        sessionStore.patch({
            view: { ...current.view, indicatorSettings: newSettings },
            updatedAt: Date.now(),
        });
        sessionStore.save();
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
            <div className="flex h-dvh w-screen flex-col items-center justify-center gap-3 bg-canvas text-center">
                <span className="text-sm font-semibold text-bear">
                    Failed to load market data
                </span>
                <span className="max-w-md text-xs text-sub">{source.error.message}</span>
            </div>
        );
    }

    if (!source.dataRange || !source.candleData || !replay.hasRestored) {
        return (
            <div className="flex h-dvh w-screen flex-col items-center justify-center gap-3 bg-canvas">
                <span
                    className="h-6 w-6 animate-spin rounded-full border-2 border-edge-strong border-t-accent"
                    aria-hidden="true"
                />
                <span className="text-xs font-medium tracking-wide text-sub">
                    Loading historical data…
                </span>
            </div>
        );
    }

    const replayToolbarProps: ReplayToolbarProps = {
        minDate: source.dataRange.start,
        maxDate: source.dataRange.end,
        currentDate: source.currentDate,
        timeFrameMinutes,
        speed,
        indicatorSettings: indicatorSettings,

        isPlaying: replay.isPlaying,
        direction: replay.direction,
        isDone: replay.isDone,

        setSpeed: setChartSpeed,
        setIndicatorSettings: handleIndicatorChange,
        setTimeFrame: setTimeFrame,
        setChartDate: setChartDate,

        stop: replay.stop,
        start: replay.start,
        playback: replay.playback,
        restart: replay.restart,

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
            className="flex h-dvh w-full flex-col overflow-hidden bg-canvas font-sans"
        >
            <MarketHeader
                symbol={config.symbol}
                pointValue={source.pointValue}
                commission={source.commission}
                price={fullPriceData.Price}
                high={fullPriceData.High}
                low={fullPriceData.Low}
                isPlaying={replay.isPlaying}
                isDone={replay.isDone}
            />

            <ReplayToolbar {...replayToolbarProps} />

            <div className="min-h-0 flex-1 p-2">
                <div className="relative h-full w-full overflow-hidden rounded-lg border border-edge bg-canvas">
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
                                    upColor: Color.Bullish,
                                    downColor: Color.Bearish,
                                    borderVisible: false,
                                    wickUpColor: Color.Bullish,
                                    wickDownColor: Color.Bearish,
                                    priceLineStyle: LineStyle.Dashed,
                                    priceLineWidth: 1,
                                    priceLineColor: Color.MutedText,
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
                                    priceLineVisible: false,
                                    lastValueVisible: false,
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
                            lineEditMode={lineEditMode}
                            enter={trade.enter}
                            close={trade.close}
                            updatePositionPrices={trade.updatePositionPrices}
                            onClose={() => setOrderMenu(null)}
                        />
                    )}

                    <LineEditToggle
                        active={lineEditMode}
                        onToggle={() =>
                            setLineEditMode((enabled) => !enabled)
                        }
                    />

                    <GoToLatestButton
                        visible={showGoToLatest}
                        onClick={goToLatest}
                    />
                </div>
            </div>

            <TradingBar
                positionParametersRef={positionParametersRef}
                onParametersChange={persistPositionParameters}
                price={fullPriceData.Price}
                pl={trade.pl}
                reset={() => {
                    trade.reset();
                    resetIndicators();
                }}
                enter={trade.enter}
                closeAll={trade.closeAll}
            />
        </div>
    );
}
