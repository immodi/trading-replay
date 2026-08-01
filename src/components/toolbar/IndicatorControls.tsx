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

    return (
        <>
            {/* Toggle button */}
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 rounded border border-[#363A45] bg-[#131722] px-3 py-1.5 text-sm text-gray-300 transition hover:border-gray-500 hover:bg-[#1B2130]"
            >
                <span>📊</span> Indicators
                <span className="text-xs text-gray-500">{isOpen ? "▲" : "▼"}</span>
            </button>

            {/* Dropdown panel - fixed position, no clipping */}
            {isOpen && dropdownPos && (
                <div
                    className="fixed z-[999] min-w-[240px] rounded-md border border-[#363A45] bg-[#131722] p-3 shadow-xl"
                    style={{
                        top: dropdownPos.top,
                        right: dropdownPos.right,
                    }}
                >
                    <div className="text-xs text-gray-400 mb-2">Indicators</div>

                    {/* VWAP */}
                    <IndicatorItem
                        label="VWAP"
                        enabled={settings.vwap.enabled}
                        color={settings.vwap.color}
                        onToggle={() => update("vwap", { enabled: !settings.vwap.enabled })}
                        onColorChange={(color) => update("vwap", { color })}
                    />

                    <div className="my-1 border-t border-[#2a2e39]" />

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

                    <div className="my-1 border-t border-[#2a2e39]" />

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
