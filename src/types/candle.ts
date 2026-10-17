import type { UTCTimestamp } from "lightweight-charts";

/**
 * Minimal OHLCV row: one raw 1‑minute bar exactly as it is stored and
 * served (the shape of the on‑disk JSON), before the replay engine adds
 * any derived data.
 */
export interface RawCandle {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * A candle as used throughout the app and the replay engine: raw OHLCV
 * plus the per‑candle high/low history accumulated while aggregating.
 */
export interface Candle extends RawCandle {
    highHistory: number[];
    lowHistory: number[];
}
