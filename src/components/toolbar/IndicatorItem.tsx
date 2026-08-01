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
        <div className="flex items-center gap-2 py-1">
            {/* Toggle checkbox */}
            <input
                type="checkbox"
                checked={enabled}
                onChange={onToggle}
                className="w-4 h-4 accent-blue-500 cursor-pointer"
            />

            {/* Label */}
            <span className="text-sm text-gray-300 w-10">{label}</span>

            {/* Color picker */}
            <input
                type="color"
                value={color}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
            />

            {/* Period input (only for EMA/SMA) */}
            {showPeriod && (
                <input
                    type="number"
                    min={1}
                    step={1}
                    value={period ?? 14}
                    onChange={(e) => onPeriodChange?.(Number(e.target.value))}
                    className="w-12 rounded border border-[#363A45] bg-[#131722] px-1 py-0.5 text-sm text-gray-200 outline-none focus:border-blue-500"
                />
            )}
        </div>
    );
}
