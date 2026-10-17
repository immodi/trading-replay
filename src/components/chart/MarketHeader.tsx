type MarketHeaderProps = {
    symbol: string;
    pointValue: number;
    commission: number;
    price: number;
    high: number;
    low: number;
    isPlaying: boolean;
    isDone: boolean;
};

function formatPrice(value: number): string {
    return Number.isFinite(value)
        ? value.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
        : "—";
}

export function MarketHeader({
    symbol,
    pointValue,
    commission,
    price,
    high,
    low,
    isPlaying,
    isDone,
}: MarketHeaderProps) {
    const status = isDone
        ? { label: "Complete", dot: "bg-sub", text: "text-sub", ring: "border-edge-strong" }
        : isPlaying
            ? { label: "Playing", dot: "bg-bull", text: "text-bull", ring: "border-bull/40" }
            : { label: "Paused", dot: "bg-amber-400", text: "text-amber-300", ring: "border-amber-400/40" };

    return (
        <header
            className="
                flex
                h-14
                shrink-0
                items-center
                gap-4
                overflow-x-auto
                border-b
                border-edge
                bg-surface
                px-4
                whitespace-nowrap
            "
        >
            {/* Identity */}
            <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                        <rect x="3" y="9" width="4" height="7" rx="1" fill="currentColor" opacity="0.5" />
                        <rect x="10" y="5" width="4" height="12" rx="1" fill="currentColor" />
                        <rect x="17" y="10" width="4" height="6" rx="1" fill="currentColor" opacity="0.5" />
                    </svg>
                </span>
                <div className="flex flex-col justify-center">
                    <span className="text-sm font-semibold leading-none tracking-tight text-ink">
                        {symbol || "—"}
                    </span>
                    <span className="mt-1.5 text-[10px] font-medium uppercase leading-none tracking-[0.14em] text-faint">
                        ${pointValue.toFixed(2)}/pt · ${commission.toFixed(2)}/side
                    </span>
                </div>
            </div>

            <div className="h-7 w-px shrink-0 bg-edge" />

            {/* Last price */}
            <div className="flex items-baseline gap-2">
                <span className="font-mono text-lg font-semibold leading-none tabular-nums text-ink">
                    {formatPrice(price)}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
                    Last
                </span>
            </div>

            {/* Session range */}
            <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
                <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-bull">
                        H
                    </span>
                    <span className="text-sub">{formatPrice(high)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-bear">
                        L
                    </span>
                    <span className="text-sub">{formatPrice(low)}</span>
                </span>
            </div>

            <div className="ml-auto flex items-center">
                <span
                    className={`
                        inline-flex
                        items-center
                        gap-2
                        rounded-full
                        border
                        bg-canvas/60
                        px-3
                        py-1
                        text-[10px]
                        font-semibold
                        uppercase
                        tracking-[0.14em]
                        ${status.ring}
                        ${status.text}
                    `}
                >
                    <span
                        className={`h-1.5 w-1.5 rounded-full ${status.dot} ${isPlaying ? "animate-pulse" : ""}`}
                    />
                    {status.label}
                </span>
            </div>
        </header>
    );
}
