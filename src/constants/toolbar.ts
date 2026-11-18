export const Timeframes = [
    { label: "1 Minute", value: 1 },
    { label: "3 Minutes", value: 3 },
    { label: "5 Minutes", value: 5 },
    { label: "15 Minutes", value: 15 },
    { label: "30 Minutes", value: 30 },
    { label: "1 Hour", value: 60 },
    { label: "5 Hours", value: 300 },
    { label: "1 Day", value: 1440 },
    // Longer aggregations are only exposed for daily-based sources (stocks).
    { label: "1 Week", value: 10080, minBaseTimeframeMinutes: 1440 },
    { label: "1 Month", value: 43200, minBaseTimeframeMinutes: 1440 },
    { label: "3 Months", value: 129600, minBaseTimeframeMinutes: 1440 },
    { label: "1 Year", value: 525600, minBaseTimeframeMinutes: 1440 },
] as const;

export const Timeframe = {
    Minute1: 1,
    Minute3: 3,
    Minute5: 5,
    Minute15: 15,
    Minute30: 30,
    Hour1: 60,
    Hour5: 300,
    Day1: 1440,
    Week1: 10080,
    Month1: 43200,
    Quarter3: 129600,
    Year1: 525600,
} as const;
