export type ChartTimezone =
    | "local"
    | "UTC"
    | "America/New_York"
    | "Europe/London"
    | "Asia/Tokyo";

export const CHART_TIMEZONES = [
    { value: "America/New_York", label: "New York (ET)" },
    { value: "Europe/London", label: "London" },
    { value: "Asia/Tokyo", label: "Tokyo" },
    { value: "UTC", label: "UTC" },
    { value: "local", label: "Local" },
] as const satisfies readonly {
    value: ChartTimezone;
    label: string;
}[];

export const DEFAULT_CHART_TIMEZONE: ChartTimezone = "America/New_York";

export function isChartTimezone(value: unknown): value is ChartTimezone {
    return (
        typeof value === "string" &&
        CHART_TIMEZONES.some((timezone) => timezone.value === value)
    );
}

export function resolveChartTimezone(value: ChartTimezone): string | undefined {
    if (value === "local") {
        return undefined;
    }

    return value;
}

export function chartTimezoneLabel(value: ChartTimezone): string {
    return (
        CHART_TIMEZONES.find((timezone) => timezone.value === value)?.label ??
        CHART_TIMEZONES[0].label
    );
}
