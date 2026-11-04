import { useCallback, useEffect, useRef, useState } from "react";

import { INDICATOR_CATALOG } from "@/constants/indicators";
import { createIndicator } from "@/indicators/config";
import type { IndicatorConfig, IndicatorType } from "@/types/indicator";
import { IndicatorItem } from "./IndicatorItem";

type IndicatorControlsProps = {
    indicators: IndicatorConfig[];
    onChange: (indicators: IndicatorConfig[]) => void;
};

type DropdownPosition = {
    top: number;
    right: number;
    maxHeight: number;
};

export function IndicatorControls({
    indicators,
    onChange,
}: IndicatorControlsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(
        null,
    );
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const updatePosition = useCallback(() => {
        const button = buttonRef.current;
        if (!button) return;

        const rect = button.getBoundingClientRect();
        const top = rect.bottom + 8;
        const right = Math.max(8, window.innerWidth - rect.right);
        const maxHeight = Math.max(160, window.innerHeight - top - 16);

        setDropdownPos((current) => {
            if (
                current &&
                current.top === top &&
                current.right === right &&
                current.maxHeight === maxHeight
            ) {
                return current;
            }

            return { top, right, maxHeight };
        });
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        updatePosition();

        const handleViewportChange = () => updatePosition();
        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, true);

        return () => {
            window.removeEventListener("resize", handleViewportChange);
            window.removeEventListener("scroll", handleViewportChange, true);
        };
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;

            if (
                buttonRef.current?.contains(target) ||
                panelRef.current?.contains(target)
            ) {
                return;
            }

            setIsOpen(false);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsOpen(false);
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    const updateIndicator = (
        id: string,
        updates: Partial<IndicatorConfig>,
    ) => {
        onChange(
            indicators.map((indicator) =>
                indicator.id === id ? { ...indicator, ...updates } : indicator,
            ),
        );
    };

    const removeIndicator = (id: string) => {
        onChange(indicators.filter((indicator) => indicator.id !== id));
    };

    const addIndicator = (type: IndicatorType) => {
        onChange([...indicators, createIndicator(type, indicators)]);
    };

    const activeCount = indicators.filter(
        (indicator) => indicator.enabled,
    ).length;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => {
                    if (isOpen) {
                        setIsOpen(false);
                        return;
                    }

                    updatePosition();
                    setIsOpen(true);
                }}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
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

            {isOpen && dropdownPos && (
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="Chart indicators"
                    className="
                        fixed
                        z-[999]
                        flex
                        w-80
                        max-w-[calc(100vw-1rem)]
                        flex-col
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
                        maxHeight: dropdownPos.maxHeight,
                    }}
                >
                    <div className="flex items-start justify-between gap-3 px-1 pb-2">
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                                Overlays
                            </div>
                            <div className="mt-0.5 text-[11px] text-sub">
                                Manage chart indicators
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            aria-label="Close indicators"
                            className="
                                inline-flex
                                h-6
                                w-6
                                items-center
                                justify-center
                                rounded-md
                                text-faint
                                transition
                                hover:bg-white/5
                                hover:text-ink
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

                    <div className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-0.5">
                        {indicators.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-edge px-3 py-6 text-center">
                                <p className="text-xs font-medium text-sub">
                                    No indicators yet
                                </p>
                                <p className="mt-1 text-[10px] text-faint">
                                    Add an overlay below to get started.
                                </p>
                            </div>
                        ) : (
                            indicators.map((indicator) => (
                                <IndicatorItem
                                    key={indicator.id}
                                    indicator={indicator}
                                    onChange={(updates) =>
                                        updateIndicator(indicator.id, updates)
                                    }
                                    onRemove={() =>
                                        removeIndicator(indicator.id)
                                    }
                                />
                            ))
                        )}
                    </div>

                    <div className="mt-3 shrink-0 border-t border-edge pt-3">
                        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                            Add indicator
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                            {INDICATOR_CATALOG.map((entry) => (
                                <button
                                    key={entry.type}
                                    type="button"
                                    onClick={() => addIndicator(entry.type)}
                                    title={`Add another ${entry.label}`}
                                    className="
                                        inline-flex
                                        items-center
                                        justify-center
                                        gap-1
                                        rounded-md
                                        border
                                        border-edge
                                        bg-canvas
                                        px-2
                                        py-1.5
                                        text-[11px]
                                        font-semibold
                                        text-sub
                                        transition
                                        hover:border-accent/50
                                        hover:bg-accent/10
                                        hover:text-ink
                                    "
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    >
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                    {entry.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
