import type { UTCTimestamp } from "lightweight-charts";

export interface Candle {
    time: UTCTimestamp;
    open: number;
    high: number;
    highHistory: number[];
    low: number;
    lowHistory: number[];
    close: number;
    volume: number;
}
