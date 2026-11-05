import {
    CHART_TIMEZONES,
    type ChartTimezone,
} from "@/constants/timezone";

type ReplayTimezoneSelectProps = {
    timezone: ChartTimezone;
    setTimezone: (timezone: ChartTimezone) => void;
};

export function ReplayTimezoneSelect({
    timezone,
    setTimezone,
}: ReplayTimezoneSelectProps) {
    return (
        <div className="flex shrink-0 items-center gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Timezone
            </label>

            <div className="relative">
                <select
                    aria-label="Chart timezone"
                    value={timezone}
                    onChange={(event) =>
                        setTimezone(event.target.value as ChartTimezone)
                    }
                    className="
                        cursor-pointer
                        appearance-none
                        rounded-md
                        border
                        border-edge
                        bg-surface
                        py-1
                        pl-2.5
                        pr-7
                        text-xs
                        font-medium
                        text-ink
                        outline-none
                        transition
                        hover:border-edge-strong
                        focus:border-accent/60
                    "
                >
                    {CHART_TIMEZONES.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                            {entry.label}
                        </option>
                    ))}
                </select>

                <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-faint"
                >
                    <path
                        d="M5 7.5l5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
        </div>
    );
}
