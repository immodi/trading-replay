import { useEffect, useRef, useState } from "react";

import type { SessionSummary, SessionTrade } from "@/types/session";

type SessionControlsProps = {
    instrument: string;
    trades: SessionTrade[];
    summary: SessionSummary;
    /** True while the session contains changes not yet exported. */
    hasUnexportedChanges: boolean;
    onRemove: (id: string) => void;
    onExport: () => void;
};

/** `HH:MM` in UTC — replay timestamps are UTC. */
function formatClock(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString().slice(11, 16);
}

type SummaryStatProps = {
    label: string;
    value: string;
    valueClassName?: string;
};

function SummaryStat({ label, value, valueClassName }: SummaryStatProps) {
    return (
        <div className="rounded-md border border-edge bg-canvas/60 px-2 py-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
                {label}
            </div>
            <div className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${valueClassName ?? "text-ink"}`}>
                {value}
            </div>
        </div>
    );
}

export function SessionControls({
    instrument,
    trades,
    summary,
    hasUnexportedChanges,
    onRemove,
    onExport,
}: SessionControlsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + 6,
                right: window.innerWidth - rect.right,
            });
        }
    }, [isOpen]);

    const net = summary.totalNetProfitLoss;
    const netColor = net > 0
        ? "text-bull"
        : net < 0
            ? "text-bear"
            : "text-sub";

    return (
        <>
            {/* Toggle button */}
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="
                    flex
                    shrink-0
                    items-center
                    gap-2
                    rounded-md
                    border
                    border-edge
                    bg-surface
                    px-3
                    py-1.5
                    text-xs
                    font-semibold
                    text-sub
                    transition
                    hover:border-edge-strong
                    hover:text-ink
                "
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="h-4 w-4"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M9 4.5h6a1 1 0 0 1 1 1V6H8v-.5a1 1 0 0 1 1-1Z" />
                    <path d="M8 6H6.5A1.5 1.5 0 0 0 5 7.5v11A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17.5 6H16" />
                    <path d="M9 12h6M9 16h4" />
                </svg>
                Session
                <span className="rounded-full border border-edge bg-canvas px-1.5 font-mono text-[10px] tabular-nums text-sub">
                    {summary.tradeCount}
                </span>
                {hasUnexportedChanges && summary.tradeCount > 0 && (
                    <span
                        title="Unexported session changes"
                        className="h-1.5 w-1.5 rounded-full bg-amber-400"
                    />
                )}
                <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                    className={`h-3 w-3 text-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                    <path
                        d="M5 7.5l5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>

            {/* Dropdown panel — fixed position so it is never clipped */}
            {isOpen && dropdownPos && (
                <div
                    className="
                        fixed
                        z-[999]
                        flex
                        w-80
                        flex-col
                        gap-3
                        rounded-lg
                        border
                        border-edge-strong
                        bg-surface/95
                        p-3
                        shadow-2xl
                        shadow-black/50
                        backdrop-blur
                    "
                    style={{
                        top: dropdownPos.top,
                        right: dropdownPos.right,
                    }}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">
                            Trading session{instrument ? ` · ${instrument}` : ""}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
                            In-memory only
                        </span>
                    </div>

                    <p className="rounded-md border border-amber-500/30 text-wrap bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-300">
                        Nothing is saved. Refreshing, closing the tab, or leaving the
                        app before exporting will discard this session.
                    </p>

                    <div className="grid grid-cols-3 gap-2">
                        <SummaryStat label="Trades" value={String(summary.tradeCount)} />
                        <SummaryStat
                            label="Net P/L"
                            value={`${net >= 0 ? "+" : ""}${net.toFixed(2)}`}
                            valueClassName={netColor}
                        />
                        <SummaryStat
                            label="Commissions"
                            value={summary.totalCommission.toFixed(2)}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={onExport}
                        disabled={summary.tradeCount === 0}
                        className="
                            w-full
                            cursor-pointer
                            rounded-md
                            bg-accent
                            px-3
                            py-1.5
                            text-xs
                            font-semibold
                            text-white
                            transition
                            hover:brightness-110
                            disabled:cursor-not-allowed
                            disabled:opacity-40
                        "
                    >
                        Export session JSON
                    </button>

                    {trades.length === 0 ? (
                        <p className="rounded-md border border-dashed border-edge px-3 py-4 text-center text-xs text-faint">
                            No completed trades yet.
                        </p>
                    ) : (
                        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                            {trades.map((trade) => (
                                <li
                                    key={trade.id}
                                    className="flex items-center justify-between gap-2 rounded-md border border-edge bg-canvas/60 px-2 py-1.5"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className={`text-[10px] font-bold uppercase tracking-wide ${trade.direction === "long"
                                                    ? "text-bull"
                                                    : "text-bear"
                                                    }`}
                                            >
                                                {trade.direction}
                                            </span>
                                            <span className="font-mono text-[11px] tabular-nums text-faint">
                                                {trade.quantity}×
                                            </span>
                                        </div>
                                        <div className="truncate font-mono text-[11px] tabular-nums text-sub">
                                            {trade.entryPrice} → {trade.exitPrice}
                                        </div>
                                        <div className="truncate font-mono text-[10px] tabular-nums text-faint">
                                            {formatClock(trade.entryTime)}–{formatClock(trade.exitTime)} UTC
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <span
                                            className={`font-mono text-[11px] font-semibold tabular-nums ${trade.netProfitLoss > 0
                                                ? "text-bull"
                                                : trade.netProfitLoss < 0
                                                    ? "text-bear"
                                                    : "text-sub"
                                                }`}
                                        >
                                            {trade.netProfitLoss >= 0 ? "+" : ""}
                                            {trade.netProfitLoss.toFixed(2)}
                                        </span>
                                        <button
                                            type="button"
                                            title="Remove trade from session"
                                            onClick={() => onRemove(trade.id)}
                                            className="
                                                cursor-pointer
                                                rounded-md
                                                border
                                                border-edge
                                                px-1.5
                                                text-xs
                                                text-sub
                                                transition
                                                hover:border-bear/60
                                                hover:bg-bear/10
                                                hover:text-bear
                                            "
                                        >
                                            ×
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </>
    );
}
