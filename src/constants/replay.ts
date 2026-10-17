export const Time = {
    Millisecond: 1,
    Second: 1_000,
    Minute: 60 * 1_000,
    Hour: 60 * 60 * 1_000,
    Day: 24 * 60 * 60 * 1_000,
} as const;

export const Color = {
    Bullish: "#26A69A",
    Bearish: "#EF5350",

    Background: "#0B0E14",
    Surface: "#121722",

    Grid: "#171D28",
    Border: "#232B3A",

    Text: "#E6EAF2",
    MutedText: "#93A0B4",

    Accent: "#3D7EFF",
} as const;
