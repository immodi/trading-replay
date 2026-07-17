export const ChartSpeeds = [
    { label: "0.25x", interval: 4000 },
    { label: "0.5x", interval: 2000 },
    { label: "1x", interval: 1000 },
    { label: "2x", interval: 500 },
    { label: "5x", interval: 200 },
    { label: "10x", interval: 100 },
    { label: "25x", interval: 40 },
    { label: "50x", interval: 20 },
    { label: "100x", interval: 10 },
] as const;

export const ChartSpeed = {
    X025: 4000,
    X05: 2000,
    X1: 1000,
    X2: 500,
    X5: 200,
    X10: 100,
    X25: 40,
    X50: 20,
    X100: 10,
} as const;
