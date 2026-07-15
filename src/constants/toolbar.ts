export const Timeframes = [
    { label: "1 Minute", value: 1 },
    { label: "3 Minutes", value: 3 },
    { label: "5 Minutes", value: 5 },
    { label: "15 Minutes", value: 15 },
    { label: "1 Hour", value: 60 },
    { label: "5 Hours", value: 300 },
    { label: "1 Day", value: 1440 },
] as const;

export const Timeframe = {
    Minute1: 1,
    Minute3: 3,
    Minute5: 5,
    Minute15: 15,
    Hour1: 60,
    Hour5: 300,
    Day1: 1440,
} as const;
