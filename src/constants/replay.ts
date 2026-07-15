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

    Background: "#131722",
    Surface: "#1E222D",

    Grid: "#2A2E39",
    Border: "#363A45",

    Text: "#D1D4DC",
    MutedText: "#8F98A3",

    Accent: "#2962FF",
} as const;
