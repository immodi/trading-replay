import { useEffect, useState } from "react";

import { indicatorCatalogEntry } from "@/constants/indicators";
import type { IndicatorConfig } from "@/types/indicator";

type IndicatorItemProps = {
    indicator: IndicatorConfig;
    onChange: (updates: Partial<IndicatorConfig>) => void;
    onRemove: () => void;
};

export function IndicatorItem({
    indicator,
    onChange,
    onRemove,
}: IndicatorItemProps) {
    const entry = indicatorCatalogEntry(indicator.type);
    const supportsPeriod = indicator.type !== "vwap";
    const [periodDraft, setPeriodDraft] = useState(String(indicator.period));

    // Keep the draft in sync when the value changes elsewhere, without
    // fighting the user while they are typing.
    useEffect(() => {
        setPeriodDraft(String(indicator.period));
    }, [indicator.period]);

    const commitPeriod = () => {
        const parsed = Number(periodDraft);

        if (!Number.isFinite(parsed) || parsed < 1) {
            setPeriodDraft(String(indicator.period));
            return;
        }

        const next = Math.floor(parsed);
        setPeriodDraft(String(next));

        if (next !== indicator.period) onChange({ period: next });
    };

    return (
        <div
            className={`
                group
                flex
                items-center
                gap-2
                rounded-lg
                border
                px-2
                py-1.5
                transition
                ${
                    indicator.enabled
                        ? "border-edge bg-raised/70"
                        : "border-transparent opacity-60 hover:bg-raised/40 hover:opacity-100"
                }
            `}
        >
            <label
                title="Line colour"
                className="relative h-5 w-5 shrink-0 cursor-pointer rounded-full border border-white/20"
                style={{ backgroundColor: indicator.color }}
            >
                <input
                    type="color"
                    value={indicator.color}
                    onChange={(event) => onChange({ color: event.target.value })}
                    aria-label={`${entry.label} line colour`}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </label>

            <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-ink">
                {entry.label}
            </span>

            {supportsPeriod ? (
                <label className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-faint">
                    <span>Period</span>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={periodDraft}
                        onChange={(event) => setPeriodDraft(event.target.value)}
                        onBlur={commitPeriod}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            commitPeriod();
                            event.currentTarget.blur();
                        }}
                        className="
                            w-12
                            rounded-md
                            border
                            border-edge
                            bg-canvas
                            px-1.5
                            py-0.5
                            text-right
                            font-mono
                            text-[11px]
                            tabular-nums
                            text-ink
                            outline-none
                            transition
                            focus:border-accent/60
                        "
                    />
                </label>
            ) : (
                <span className="text-[10px] font-medium uppercase tracking-wide text-faint">
                    Session
                </span>
            )}

            <button
                type="button"
                onClick={() => onChange({ enabled: !indicator.enabled })}
                aria-label={`${indicator.enabled ? "Hide" : "Show"} ${entry.label}`}
                aria-pressed={indicator.enabled}
                title={indicator.enabled ? "Hide on chart" : "Show on chart"}
                className={`
                    inline-flex
                    h-6
                    w-6
                    shrink-0
                    items-center
                    justify-center
                    rounded-md
                    transition
                    hover:bg-white/5
                    ${indicator.enabled ? "text-accent" : "text-faint hover:text-ink"}
                `}
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    {indicator.enabled ? (
                        <>
                            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
                            <circle cx="12" cy="12" r="2.5" />
                        </>
                    ) : (
                        <>
                            <path d="M3 3l18 18" />
                            <path d="M10.6 6.2A9.8 9.8 0 0112 6c6 0 9.5 6 9.5 6a17 17 0 01-2.4 3" />
                            <path d="M6.6 6.7A17 17 0 002.5 12s3.5 6 9.5 6a9.7 9.7 0 003.3-.6" />
                        </>
                    )}
                </svg>
            </button>

            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${entry.label}`}
                title="Remove indicator"
                className="
                    inline-flex
                    h-6
                    w-6
                    shrink-0
                    items-center
                    justify-center
                    rounded-md
                    text-faint
                    transition
                    hover:bg-bear/10
                    hover:text-bear
                "
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
        </div>
    );
}
