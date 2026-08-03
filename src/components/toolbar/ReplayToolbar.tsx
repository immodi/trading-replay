import type { PlayDirection } from "@/hooks/useReplay";
import { ReplayControls } from "./ReplayControls";
import { ReplaySpeedSelect } from "./ReplaySpeedSelect";
import { ReplayTimeframeSelect } from "./ReplayTimeframeSelect";
import type { Candle } from "@/types/candle";
import { loadContinuousMnq } from "@/data/mnq";
import { ReplayTradingControls } from "./ReplayTradingControls";
import type { Direction, Position } from "@/types/position";
import type { PositionParamters } from "@/types/positionParamters";
import { ReplayPLDisplay } from "./ReplayPLDisplay";
import { IndicatorControls } from "./IndicatorControls";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { PriceData } from "@/types/priceData";
import type { IndicatorSettings } from "@/types/indicator";

export type ReplayToolbarProps = {
    minDate: Date,
    maxDate: Date,

    isPlaying: boolean,
    isDone: boolean,
    direction: PlayDirection,
    priceData: PriceData,
    pl: number,
    positionParametersRef: React.RefObject<PositionParamters>;
    seriesApi: ISeriesApi<"Candlestick">;
    chartApi: IChartApi;
    indicatorSettings: IndicatorSettings;

    setTimeFrame: (timeFrame: number) => void
    setSpeed: (speed: number) => void,
    setCandleData: (data: Candle[]) => void,
    setChartDate: (date: Date) => void,

    reset: () => void,
    start: (direction: PlayDirection) => void,
    stop: () => void,
    restart: () => void,
    playback: (direction: PlayDirection) => void,
    setIndicatorSettings: (newSettings: IndicatorSettings) => void,
    enter: {
        (direction: Direction, quantity: number): void;
        (direction: Direction, quantity: number, entryPrice: number, stopLoss: number, takeProfit: number): void;
        (
            direction: Direction,
            quantity: number,
            stopLoss: number,
            takeProfit: number,
        ): void;
    },
    close: {
        (
            position: Position,
        ): void;
        (
            position: Position,
            exitPrice: number,
        ): void;
    };
    closeAll: () => void,

}
export function ReplayToolbar(props: ReplayToolbarProps) {
    const onDateChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const date = new Date(event.target.value);
        const candleData = await loadContinuousMnq(date);

        props.setChartDate(date)
        props.setCandleData(candleData);
    };


    return (
        <div
            className="
                relative
                flex
                h-12
                items-center
                gap-4
                border-b
                border-[#363A45]
                bg-[#1E222D]
                px-4
                overflow-x-auto
                overflow-y-visible
                whitespace-nowrap
            "
        >
            <div
                className="
                    flex
                    items-center
                    gap-2
                "
            >

                <input
                    type="date"
                    defaultValue={props.minDate.toISOString().split("T")[0]}
                    min={props.minDate.toISOString().split("T")[0]}
                    max={props.maxDate.toISOString().split("T")[0]}
                    onChange={onDateChange}
                    className="
                        rounded
                        border
                        bg-[#131722]
                        px-2
                        py-1
                        text-sm
                        text-gray-200
                        outline-none
                        transition
                        hover:border-gray-500
                        focus:border-blue-500
                    "
                />
            </div>

            <div className="h-5 w-px bg-[#363A45]" />

            <ReplaySpeedSelect setSpeed={props.setSpeed} />

            <ReplayTimeframeSelect setTimeFrame={props.setTimeFrame} />

            <ReplayControls {...props} />

            <ReplayTradingControls
                positionParametersRef={props.positionParametersRef}
                onBuyMarket={() => {
                    const { stopLossPoints, takeProfitPoints, quantity } =
                        props.positionParametersRef.current;

                    props.enter(
                        "long",
                        quantity,
                        props.priceData.Price - stopLossPoints,
                        props.priceData.Price + takeProfitPoints,
                    );
                }}

                onSellMarket={() => {
                    const { stopLossPoints, takeProfitPoints, quantity } =
                        props.positionParametersRef.current;

                    props.enter(
                        "short",
                        quantity,
                        props.priceData.Price + stopLossPoints,
                        props.priceData.Price - takeProfitPoints,
                    );
                }}
                closeAll={props.closeAll}
            />

            <ReplayPLDisplay pl={props.pl} reset={props.reset} />


            <IndicatorControls
                settings={props.indicatorSettings}
                onChange={props.setIndicatorSettings}
            />

        </div>
    );
}
