export type PositionParamters = {
    stopLossPoints: number;
    takeProfitPoints: number;
    quantity: number;
    /** When false, orders are placed without a stop loss or take profit. */
    bracket: boolean;
}
