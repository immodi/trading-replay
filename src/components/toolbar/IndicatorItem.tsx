type IndicatorItemProps = {
    label: string;
    enabled: boolean;
    color: string;
    period?: number;
    onToggle: () => void;
    onColorChange: (color: string) => void;
    onPeriodChange?: (period: number) => void;
    showPeriod?: boolean;
};

export function IndicatorItem({
    label,
    enabled,
    color,
    period,
    onToggle,
    onColorChange,
    onPeriodChange,
    showPeriod = false,
}: IndicatorItemProps) {
    return (
        <div
            className={`
                flex
                items-center
                gap-2
                rounded-md
                px-2
                py-1.5
                transition
                ${enabled ? "bg-raised/60" : "hover:bg-raised/40"}
            `}
        >
            {/* Toggle checkbox */}
            <input
                type="checkbox"
                checked={enabled}
                onChange={onToggle}
                className="h-3.5 w-3.5 cursor-pointer accent-accent"
            />

            {/* Label */}
            <span className="w-10 text-xs font-semibold tracking-wide text-ink">
                {label}
            </span>

            {/* Color picker */}
            <input
                type="color"
                value={color}
                onChange={(e) => onColorChange(e.target.value)}
                className="h-6 w-6 cursor-pointer rounded-md border border-edge bg-transparent p-0"
            />

            {/* Period input (only for EMA/SMA) */}
            {showPeriod && (
                <input
                    type="number"
                    min={1}
                    step={1}
                    value={period ?? 14}
                    onChange={(e) => onPeriodChange?.(Number(e.target.value))}
                    className="
                        ml-auto
                        w-14
                        rounded-md
                        border
                        border-edge
                        bg-canvas
                        px-1.5
                        py-0.5
                        text-right
                        font-mono
                        text-xs
                        tabular-nums
                        text-ink
                        outline-none
                        transition
                        focus:border-accent/60
                    "
                />
            )}
        </div>
    );
}
