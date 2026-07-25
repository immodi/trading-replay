import type { PositionParamters } from "@/types/positionParamters";
import type React from "react";

type ReplayTradingControlsProps = {
    onBuyMarket: () => void;
    onSellMarket: () => void;
    positionParametersRef: React.RefObject<PositionParamters>;
};

export function ReplayTradingControls({
    onBuyMarket,
    onSellMarket,
    positionParametersRef
}: ReplayTradingControlsProps) {
    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
                <label
                    htmlFor="trading-stop-loss"
                    className="text-xs text-gray-400"
                >
                    SL
                </label>

                <input
                    id="trading-stop-loss"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={positionParametersRef.current.stopLossPoints}
                    onChange={e => {
                        positionParametersRef.current.stopLossPoints = Number(e.target.value);
                    }}
                    className="
                        w-16
                        rounded
                        border
                        bg-[#131722]
                        px-2
                        py-1
                        text-sm
                        text-gray-200
                        outline-none
                        appearance-none
                        focus:border-blue-500
                    "
                />
            </div>

            <div className="flex items-center gap-1">
                <label
                    htmlFor="trading-take-profit"
                    className="text-xs text-gray-400"
                >
                    TP
                </label>

                <input
                    id="trading-take-profit"
                    type="number"
                    min={1}
                    step={1}
                    onChange={e => {
                        positionParametersRef.current.takeProfitPoints = Number(e.target.value);
                    }}
                    defaultValue={positionParametersRef.current.takeProfitPoints}
                    className="
                        w-16
                        rounded
                        border
                        bg-[#131722]
                        px-2
                        py-1
                        text-sm
                        text-gray-200
                        outline-none
                        appearance-none
                        focus:border-blue-500
                    "
                />
            </div>

            <button
                type="button"
                onClick={onBuyMarket}
                className="
                    rounded
                    bg-[#26a69a]
                    px-2
                    py-1
                    text-sm
                    font-medium
                    text-white
                    transition
                    hover:bg-[#2bbbad]
                "
            >
                Buy Market
            </button>

            <button
                type="button"
                onClick={onSellMarket}
                className="
                    rounded
                    bg-[#ef5350]
                    px-2
                    py-1
                    text-sm
                    font-medium
                    text-white
                    transition
                    hover:bg-[#f05f5c]
                "
            >
                Sell Market
            </button>
        </div>
    );
}
