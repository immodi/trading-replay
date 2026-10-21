import type { UTCTimestamp } from "lightweight-charts";

export type Direction = "long" | "short";
export type State = "open" | "waiting" | "close";
export type OrderType = "market" | "stop";

export type Position = {
    id: `${string}-${string}-${string}-${string}-${string}`;
    side: Direction;
    state: State;
    orderType: OrderType;
    quantity: number;

    entryPrice: number;
    entryTime: UTCTimestamp;


    stopLoss?: number;
    takeProfit?: number;

    exitPrice?: number;
    exitTime?: number;
};

/** Price fields that can be changed by dragging an order's chart lines. */
export type PositionPricePatch = Partial<
    Pick<Position, "entryPrice" | "stopLoss" | "takeProfit">
>;

export type EnterOrder = {
    direction: Direction;
    quantity: number;
    orderType?: OrderType;

    /**
     * Defaults to the current market price for "market" orders.
     */
    entryPrice?: number;

    /** Optional - omit to place the order without a stop loss. */
    stopLoss?: number;

    /** Optional - omit to place the order without a take profit. */
    takeProfit?: number;
};
