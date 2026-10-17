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
        <div className="rounded border border-[#2a2e39] bg-[#171B26] px-2 py-1.5">
            <div className="text-[10px] text-gray-500">{label}</div>
            <div className={`text-xs font-semibold ${valueClassName ?? "text-gray-200"}`}>
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
        ? "text-[#26a69a]"
        : net < 0
            ? "text-[#ef5350]"
            : "text-gray-300";

    return (
        <>
            {/* Toggle button */}
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 rounded border border-[#363A45] bg-[#131722] px-3 py-1.5 text-sm text-gray-300 transition hover:border-gray-500 hover:bg-[#1B2130]"
            >
                <span>🧾</span> Session
                <span className="rounded-full bg-[#363A45] px-1.5 text-[10px] text-gray-200">
                    {summary.tradeCount}
                </span>
                {hasUnexportedChanges && summary.tradeCount > 0 && (
                    <span
                        title="Unexported session changes"
                        className="h-1.5 w-1.5 rounded-full bg-amber-400"
                    />
                )}
                <span className="text-xs text-gray-500">{isOpen ? "▲" : "▼"}</span>
            </button>

            {/* Dropdown panel — fixed position so it is never clipped */}
            {isOpen && dropdownPos && (
                <div
                    className="fixed z-[999] flex w-80 flex-col gap-3 rounded-md border border-[#363A45] bg-[#131722] p-3 shadow-xl"
                    style={{
                        top: dropdownPos.top,
                        right: dropdownPos.right,
                    }}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-200">
                            Trading session{instrument ? ` · ${instrument}` : ""}
                        </span>
                        <span className="text-[10px] text-gray-500">In-memory only</span>
                    </div>

                    <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
                        ⚠️ Nothing is saved. Refreshing, closing the tab, or leaving the
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
                        className="w-full cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Export session JSON
                    </button>

                    {trades.length === 0 ? (
                        <p className="rounded border border-dashed border-[#363A45] px-3 py-4 text-center text-xs text-gray-500">
                            No completed trades yet.
                        </p>
                    ) : (
                        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                            {trades.map((trade) => (
                                <li
                                    key={trade.id}
                                    className="flex items-center justify-between gap-2 rounded border border-[#2a2e39] bg-[#171B26] px-2 py-1.5"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className={`text-[10px] font-semibold uppercase ${
                                                    trade.direction === "long"
                                                        ? "text-[#26a69a]"
                                                        : "text-[#ef5350]"
                                                }`}
                                            >
                                                {trade.direction}
                                            </span>
                                            <span className="text-[11px] text-gray-400">
                                                {trade.quantity}×
                                            </span>
                                        </div>
                                        <div className="truncate text-[11px] text-gray-300">
                                            {trade.entryPrice} → {trade.exitPrice}
                                        </div>
                                        <div className="truncate text-[10px] text-gray-500">
                                            {formatClock(trade.entryTime)}–{formatClock(trade.exitTime)} UTC
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <span
                                            className={`text-[11px] font-semibold ${
                                                trade.netProfitLoss > 0
                                                    ? "text-[#26a69a]"
                                                    : trade.netProfitLoss < 0
                                                        ? "text-[#ef5350]"
                                                        : "text-gray-300"
                                            }`}
                                        >
                                            {trade.netProfitLoss >= 0 ? "+" : ""}
                                            {trade.netProfitLoss.toFixed(2)}
                                        </span>
                                        <button
                                            type="button"
                                            title="Remove trade from session"
                                            onClick={() => onRemove(trade.id)}
                                            className="cursor-pointer rounded border border-[#363A45] px-1.5 text-xs text-gray-400 transition hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300"
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
