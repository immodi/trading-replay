import type { EnterOrder } from "@/types/position";
import type { PositionParamters } from "@/types/positionParamters";
import { ReplayPLDisplay } from "./ReplayPLDisplay";
import { ReplayTradingControls } from "./ReplayTradingControls";

type TradingBarProps = {
    positionParametersRef: React.RefObject<PositionParamters>;
    price: number;
    pl: number;
    reset: () => void;
    enter: (order: EnterOrder) => void;
    closeAll: () => void;
};

export function TradingBar({
    positionParametersRef,
    price,
    pl,
    reset,
    enter,
    closeAll,
}: TradingBarProps) {
    const openPosition = (direction: "long" | "short") => {
        const { stopLossPoints, takeProfitPoints, quantity, bracket } =
            positionParametersRef.current;

        const isLong = direction === "long";

        enter({
            direction,
            quantity,
            stopLoss: bracket
                ? isLong ? price - stopLossPoints : price + stopLossPoints
                : undefined,
            takeProfit: bracket
                ? isLong ? price + takeProfitPoints : price - takeProfitPoints
                : undefined,
        });
    };

    return (
        <div
            className="
                flex
                h-14
                shrink-0
                items-center
                gap-4
                overflow-x-auto
                border-t
                border-edge
                bg-surface
                px-4
                whitespace-nowrap
            "
        >
            <ReplayPLDisplay pl={pl} reset={reset} />

            <div className="h-7 w-px shrink-0 bg-edge" />

            <ReplayTradingControls
                positionParametersRef={positionParametersRef}
                onBuyMarket={() => openPosition("long")}
                onSellMarket={() => openPosition("short")}
                closeAll={closeAll}
            />

            <div className="ml-auto hidden min-w-0 flex-1 items-center justify-end overflow-hidden pl-4 lg:flex">
                <span
                    className="min-w-0 truncate text-[11px] text-faint"
                    title="Right-click the chart to place a stop order · Shift+drag order lines to edit"
                >
                    Right-click the chart to place a stop order · Shift+drag order lines to edit
                </span>
            </div>
        </div>
    );
}
