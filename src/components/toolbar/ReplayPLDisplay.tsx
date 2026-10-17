type ReplayPLDisplayProps = {
    pl: number;
    reset: () => void;
};

export function ReplayPLDisplay({
    pl,
    reset,
}: ReplayPLDisplayProps) {
    const isPositive = pl > 0;
    const isNegative = pl < 0;
    const color = isPositive
        ? "text-bull"
        : isNegative
            ? "text-bear"
            : "text-sub";

    return (
        <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                    P/L
                </span>
                <span className={`font-mono text-base font-semibold tabular-nums ${color}`}>
                    {pl >= 0 ? "+" : ""}
                    {pl.toFixed(2)}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
                    USD
                </span>
            </div>

            <button
                type="button"
                onClick={reset}
                className="
                    rounded-md
                    border
                    border-edge
                    bg-canvas
                    px-2
                    py-1
                    text-[10px]
                    font-semibold
                    uppercase
                    tracking-wider
                    text-sub
                    transition
                    hover:border-edge-strong
                    hover:text-ink
                "
            >
                Reset
            </button>
        </div>
    );
}
