import type { Position } from "@/types/position";

/**
 * Commission for a completed trade: the per‑side rate is charged on entry and
 * again on exit, for every contract.
 */
export function calculateCommission(
    quantity: number,
    commissionPerSide: number,
): number {
    return commissionPerSide * 2 * quantity;
}

/**
 * Realised gross P/L of a position in dollars, before commission, using the
 * instrument's dollar value per point. Positions without a realised exit fall
 * back to their entry price, so the result is 0.
 */
export function calculateGrossProfitLoss(
    position: Pick<Position, "side" | "quantity" | "entryPrice" | "exitPrice">,
    pointDollarValue: number,
): number {
    const exitPrice = position.exitPrice ?? position.entryPrice;
    const dollarsPerPoint = pointDollarValue * position.quantity;

    return position.side === "long"
        ? (exitPrice - position.entryPrice) * dollarsPerPoint
        : (position.entryPrice - exitPrice) * dollarsPerPoint;
}

/**
 * Realised P/L of a closed position in dollars, net of commission. This is the
 * app's single source of truth for trading maths and returns 0 for positions
 * without a realised exit.
 */
export function calculatePositionPL(
    position: Pick<Position, "state" | "side" | "quantity" | "entryPrice" | "exitPrice">,
    pointDollarValue: number,
    commissionPerSide: number,
): number {
    if (position.state !== "close" || position.exitPrice === undefined) {
        return 0;
    }

    return (
        calculateGrossProfitLoss(position, pointDollarValue) -
        calculateCommission(position.quantity, commissionPerSide)
    );
}
