
type ReplayPLDisplayProps = {
    pl: number;
    resetPl: () => void;
};

export function ReplayPLDisplay({
    pl,
    resetPl,
}: ReplayPLDisplayProps) {
    return (
        <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">
                    P/L
                </span>

                <span
                    className={`text-sm font-medium ${pl > 0
                        ? "text-[#26a69a]"
                        : pl < 0
                            ? "text-[#ef5350]"
                            : "text-gray-300"
                        }`}
                >
                    {pl >= 0 ? "+" : ""}
                    ${pl.toFixed(2)}
                </span>
            </div>

            <button
                type="button"
                onClick={resetPl}
                className="
                    rounded
                    border
                    border-[#363A45]
                    bg-[#131722]
                    px-2
                    py-1
                    text-xs
                    text-gray-300
                    transition
                    hover:border-gray-500
                    hover:bg-[#1B2130]
                "
            >
                Reset P/L
            </button>
        </div>
    );
}
