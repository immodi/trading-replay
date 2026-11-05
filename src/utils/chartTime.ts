import {
    TickMarkType,
    type BusinessDay,
    type Time,
    type TimeFormatterFn,
    type TickMarkFormatter,
} from "lightweight-charts";

import {
    resolveChartTimezone,
    type ChartTimezone,
} from "@/constants/timezone";

function timeToDate(time: Time): Date | null {
    if (typeof time === "number") {
        return new Date(time * 1000);
    }

    if (typeof time === "string") {
        const parsed = Date.parse(time);
        return Number.isFinite(parsed) ? new Date(parsed) : null;
    }

    if (typeof time === "object" && time !== null && "year" in time) {
        const day = time as BusinessDay;
        return new Date(Date.UTC(day.year, day.month - 1, day.day));
    }

    return null;
}

function formatter(
    timeZone: string | undefined,
    options: Intl.DateTimeFormatOptions,
    locale?: string,
): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(locale, {
        ...options,
        ...(timeZone === undefined ? {} : { timeZone }),
        hourCycle: "h23",
    });
}

export function createChartTickMarkFormatter(
    timezone: ChartTimezone,
): TickMarkFormatter {
    const timeZone = resolveChartTimezone(timezone);

    return (time, tickMarkType, locale) => {
        const date = timeToDate(time);
        if (date === null) return null;

        switch (tickMarkType) {
            case TickMarkType.Year:
                return formatter(timeZone, { year: "numeric" }, locale).format(
                    date,
                );
            case TickMarkType.Month:
                return formatter(
                    timeZone,
                    { month: "short", year: "numeric" },
                    locale,
                ).format(date);
            case TickMarkType.DayOfMonth:
                return formatter(
                    timeZone,
                    { month: "short", day: "2-digit" },
                    locale,
                ).format(date);
            case TickMarkType.TimeWithSeconds:
                return formatter(
                    timeZone,
                    {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                    },
                    locale,
                ).format(date);
            case TickMarkType.Time:
            default:
                return formatter(
                    timeZone,
                    { hour: "2-digit", minute: "2-digit" },
                    locale,
                ).format(date);
        }
    };
}

export function createChartTimeFormatter(
    timezone: ChartTimezone,
): TimeFormatterFn {
    const timeZone = resolveChartTimezone(timezone);

    return (time) => {
        const date = timeToDate(time);
        if (date === null) return "";

        return formatter(timeZone, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
    };
}
