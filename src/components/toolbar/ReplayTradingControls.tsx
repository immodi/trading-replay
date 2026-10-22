import type { PositionParamters } from "@/types/positionParamters";
import { useState } from "react";
import type React from "react";

type ReplayTradingControlsProps = {
    onBuyMarket: () => void;
    onSellMarket: () => void;
    closeAll: () => void;
    positionParametersRef: React.RefObject<PositionParamters>;
    /** Called after any order parameter changes, so it can be persisted. */
    onParametersChange?: () => void;
};

export function ReplayTradingControls({
    onBuyMarket,
    onSellMarket,
    closeAll,
    positionParametersRef,
    onParametersChange,
}: ReplayTradingControlsProps) {
    const [bracket, setBracket] = useState(positionParametersRef.current.bracket);

    function updateParameter<K extends keyof PositionParamters>(
        key: K,
        value: PositionParamters[K],
    ) {
        positionParametersRef.current[key] = value;
        onParametersChange?.();
    }

    const labelClassName = "text-[10px] font-semibold uppercase tracking-wider text-faint";

    const inputClassName = `
        w-16
        rounded-md
        border
        border-edge
        bg-canvas
        px-2
        py-1.5
        text-right
        font-mono
        text-xs
        tabular-nums
        text-ink
        outline-none
        transition
        focus:border-accent/60
        disabled:cursor-not-allowed
        disabled:opacity-40
    `;

    return (
        <div className="flex shrink-0 items-center gap-4">
            {/* Order parameters */}
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                    <label htmlFor="trading-stop-loss" className={labelClassName}>
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
                            updateParameter("stopLossPoints", Number(e.target.value));
                        }}
                        className={inputClassName}
                    />
                </div>

                <div className="flex items-center gap-1.5">
                    <label htmlFor="trading-take-profit" className={labelClassName}>
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
                            updateParameter("takeProfitPoints", Number(e.target.value));
                        }}
                        className={inputClassName}
                    />
                </div>

                <div className="flex items-center gap-1.5">
                    <label htmlFor="trading-quantity" className={labelClassName}>
                        Qty
                    </label>
                    <input
                        id="trading-quantity"
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={positionParametersRef.current.quantity ?? 1}
                        onChange={e => {
                            updateParameter("quantity", Number(e.target.value));
                        }}
                        className={inputClassName}
                    />
                </div>

                <label
                    htmlFor="trading-bracket"
                    className={`
                        flex
                        cursor-pointer
                        items-center
                        gap-1.5
                        rounded-md
                        border
                        px-2
                        py-1.5
                        text-[10px]
                        font-semibold
                        uppercase
                        tracking-wider
                        transition
                        ${bracket
                            ? "border-accent/50 bg-accent/10 text-accent"
                            : "border-edge bg-canvas text-faint hover:text-sub"
                        }
                    `}
                    title="Attach stop loss and take profit to new orders"
                >
                    <input
                        id="trading-bracket"
                        type="checkbox"
                        checked={bracket}
                        onChange={e => {
                            const next = e.target.checked;
                            setBracket(next);
                            updateParameter("bracket", next);
                        }}
                        className="h-3.5 w-3.5 cursor-pointer accent-accent"
                    />
                    Bracket
                </label>
            </div>

            {/* Order actions */}
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={onBuyMarket}
                    className="
                        cursor-pointer
                        rounded-md
                        bg-bull
                        px-3
                        py-1.5
                        text-xs
                        font-bold
                        uppercase
                        tracking-wide
                        text-white
                        shadow-sm
                        shadow-bull/20
                        transition
                        hover:brightness-110
                        active:brightness-95
                    "
                >
                    Buy Mkt
                </button>
                <button
                    type="button"
                    onClick={onSellMarket}
                    className="
                        cursor-pointer
                        rounded-md
                        bg-bear
                        px-3
                        py-1.5
                        text-xs
                        font-bold
                        uppercase
                        tracking-wide
                        text-white
                        shadow-sm
                        shadow-bear/20
                        transition
                        hover:brightness-110
                        active:brightness-95
                    "
                >
                    Sell Mkt
                </button>
                <button
                    type="button"
                    onClick={closeAll}
                    className="
                        cursor-pointer
                        rounded-md
                        border
                        border-edge
                        bg-canvas
                        px-3
                        py-1.5
                        text-xs
                        font-semibold
                        uppercase
                        tracking-wide
                        text-sub
                        transition
                        hover:border-edge-strong
                        hover:text-ink
                    "
                >
                    Close All
                </button>
            </div>
        </div>
    );
}
