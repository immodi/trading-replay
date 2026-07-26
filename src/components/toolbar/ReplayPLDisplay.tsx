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
        ? "text-[#26a69a]"
        : isNegative
            ? "text-[#ef5350]"
            : "text-gray-300";

    return (
        <div className="ml-auto flex items-center gap-2">
            {/* P/L Badge */}
            <div className="flex items-center gap-2 rounded-md border border-[#2a2e39] bg-[#1E222D] px-3 py-1">
                <span className="text-xs text-gray-400">P/L</span>
                <span className={`text-sm font-bold ${color}`}>
                    {pl >= 0 ? "+" : ""}
                    {pl.toFixed(2)}
                </span>
                <span className="text-[10px] text-gray-500">USD</span>
            </div>

            {/* Reset Button - now smaller and more subtle */}
            <button
                type="button"
                onClick={reset}
                className="rounded border border-[#363A45] px-1.5 py-0.5 text-[10px] text-gray-400 transition hover:border-gray-500 hover:bg-[#1B2130] hover:text-gray-200"
            >
                Reset
            </button>
        </div>
    );
}
