import type { UTCTimestamp } from "lightweight-charts";

export type Direction = "long" | "short";
export type State = "open" | "waiting" | "close";

export type Position = {
    id: `${string}-${string}-${string}-${string}-${string}`;
    side: Direction;
    state: State;
    quantity: number;

    entryPrice: number;
    entryTime: UTCTimestamp;


    stopLoss?: number;
    takeProfit?: number;

    exitPrice?: number;
    exitTime?: number;
};
