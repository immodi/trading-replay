import type { PositionParamters } from "@/types/positionParamters";
import { useState } from "react";
import type React from "react";

type ReplayTradingControlsProps = {
    onBuyMarket: () => void;
    onSellMarket: () => void;
    closeAll: () => void;
    positionParametersRef: React.RefObject<PositionParamters>;
};

export function ReplayTradingControls({
    onBuyMarket,
    onSellMarket,
    closeAll,
    positionParametersRef
}: ReplayTradingControlsProps) {
    const [bracket, setBracket] = useState(positionParametersRef.current.bracket);

    const inputClassName = "w-16 rounded border bg-[#131722] px-2 py-1 text-sm text-gray-200 outline-none appearance-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40";

    return (
        <div className="flex items-center gap-3">
            {/* Input row */}
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                    <label htmlFor="trading-stop-loss" className="text-xs text-gray-400">
                        SL
                    </label>
                    <input
                        id="trading-stop-loss"
                        type="number"
                        min={1}
                        step={1}
                        disabled={!bracket}
                        defaultValue={positionParametersRef.current.stopLossPoints}
                        onChange={e => {
                            positionParametersRef.current.stopLossPoints = Number(e.target.value);
                        }}
                        className={inputClassName}
                    />
                </div>

                <div className="flex items-center gap-1">
                    <label htmlFor="trading-take-profit" className="text-xs text-gray-400">
                        TP
                    </label>
                    <input
                        id="trading-take-profit"
                        type="number"
                        min={1}
                        step={1}
                        disabled={!bracket}
                        defaultValue={positionParametersRef.current.takeProfitPoints}
                        onChange={e => {
                            positionParametersRef.current.takeProfitPoints = Number(e.target.value);
                        }}
                        className={inputClassName}
                    />
                </div>

                <div className="flex items-center gap-1">
                    <label htmlFor="trading-quantity" className="text-xs text-gray-400">
                        Qty
                    </label>
                    <input
                        id="trading-quantity"
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={positionParametersRef.current.quantity ?? 1}
                        onChange={e => {
                            positionParametersRef.current.quantity = Number(e.target.value);
                        }}
                        className={inputClassName}
                    />
                </div>

                <label
                    htmlFor="trading-bracket"
                    className="flex cursor-pointer items-center gap-1 text-xs text-gray-400"
                    title="Attach stop loss and take profit to new orders"
                >
                    <input
                        id="trading-bracket"
                        type="checkbox"
                        checked={bracket}
                        onChange={e => {
                            const next = e.target.checked;
                            setBracket(next);
                            positionParametersRef.current.bracket = next;
                        }}
                        className="h-3.5 w-3.5 cursor-pointer accent-blue-500"
                    />
                    Bracket
                </label>
            </div>

            {/* Button group */}
            <div className="flex gap-1">
                <button
                    type="button"
                    onClick={onBuyMarket}
                    className="cursor-pointer rounded bg-[#26a69a] px-2 py-2 text-xs font-medium text-white transition hover:bg-[#2bbbad]"
                >
                    Buy Mkt
                </button>
                <button
                    type="button"
                    onClick={onSellMarket}
                    className="cursor-pointer rounded bg-[#ef5350] px-2 py-2 text-xs font-medium text-white transition hover:bg-[#f05f5c]"
                >
                    Sell Mkt
                </button>
                <button
                    type="button"
                    onClick={closeAll}
                    className="cursor-pointer rounded bg-[#363A45] px-2 py-2 text-xs font-medium text-white transition hover:bg-[#4A4F5A]"
                >
                    Close All
                </button>
            </div>
        </div>
    );
}
