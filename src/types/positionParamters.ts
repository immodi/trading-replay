export type PositionParamters = {
    /** Price distance: points for futures, source-currency units for stocks. */
    stopLossPoints: number;
    /** Price distance: points for futures, source-currency units for stocks. */
    takeProfitPoints: number;
    quantity: number;
    /** When false, orders are placed without a stop loss or take profit. */
    bracket: boolean;
}
