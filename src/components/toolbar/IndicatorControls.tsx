import { useState, useRef, useEffect } from "react";
import { IndicatorItem } from "./IndicatorItem";
import type { IndicatorSettings } from "@/types/indicator";

type IndicatorControlsProps = {
    settings: IndicatorSettings;
    onChange: (newSettings: IndicatorSettings) => void;
};

export function IndicatorControls({ settings, onChange }: IndicatorControlsProps) {
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

    const update = <K extends keyof IndicatorSettings>(
        key: K,
        updates: Partial<IndicatorSettings[K]>
    ) => {
        onChange({
            ...settings,
            [key]: { ...settings[key], ...updates },
        });
    };

    const activeCount = [settings.vwap, settings.ema, settings.sma].filter(
        (indicator) => indicator.enabled
    ).length;

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
                    <path d="M4 16.5l4.5-5 3.5 3 8-9" />
                    <path d="M4 20h16" />
                </svg>
                Indicators
                {activeCount > 0 && (
                    <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 font-mono text-[10px] tabular-nums text-accent">
                        {activeCount}
                    </span>
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

            {/* Dropdown panel - fixed position, no clipping */}
            {isOpen && dropdownPos && (
                <div
                    className="
                        fixed
                        z-[999]
                        min-w-[248px]
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
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                        Overlays
                    </div>

                    {/* VWAP */}
                    <IndicatorItem
                        label="VWAP"
                        enabled={settings.vwap.enabled}
                        color={settings.vwap.color}
                        onToggle={() => update("vwap", { enabled: !settings.vwap.enabled })}
                        onColorChange={(color) => update("vwap", { color })}
                    />

                    <div className="my-1 border-t border-edge" />

                    {/* EMA */}
                    <IndicatorItem
                        label="EMA"
                        enabled={settings.ema.enabled}
                        color={settings.ema.color}
                        period={settings.ema.period}
                        onToggle={() => update("ema", { enabled: !settings.ema.enabled })}
                        onColorChange={(color) => update("ema", { color })}
                        onPeriodChange={(period) => update("ema", { period })}
                        showPeriod
                    />

                    <div className="my-1 border-t border-edge" />

                    {/* SMA */}
                    <IndicatorItem
                        label="SMA"
                        enabled={settings.sma.enabled}
                        color={settings.sma.color}
                        period={settings.sma.period}
                        onToggle={() => update("sma", { enabled: !settings.sma.enabled })}
                        onColorChange={(color) => update("sma", { color })}
                        onPeriodChange={(period) => update("sma", { period })}
                        showPeriod
                    />
                </div>
            )}
        </>
    );
}
