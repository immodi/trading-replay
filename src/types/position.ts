import type { UTCTimestamp } from "lightweight-charts";

export type Direction = "long" | "short";
export type State = "open" | "waiting" | "close";

export type Position = {
    side: Direction;
    state: State;

    entryPrice: number;
    entryTime: UTCTimestamp;

    stopLoss?: number;
    takeProfit?: number;

    exitPrice?: number;
    exitTime?: number;
};
