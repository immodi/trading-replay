import type { AssetClass } from "@/constants/assetClass";
import type { Position } from "@/types/position";

export type CommissionSettings = {
    /**
     * Flat amount per side. Stocks charge this once per order; futures charge
     * it per contract.
     */
    flatPerSide: number;
    /** Percentage of order notional charged per side. */
    percentPerSide: number;
    assetClass?: AssetClass;
};

/** Commission for one fill (entry or exit). */
export function calculateFillCommission(
    price: number,
    quantity: number,
    settings: CommissionSettings,
): number {
    const notional = Math.abs(price * quantity);
    const flat =
        settings.assetClass === "stock"
            ? settings.flatPerSide
            : settings.flatPerSide * quantity;
    const percent = notional * (settings.percentPerSide / 100);

    return flat + percent;
}

/** Commission for a completed round trip (entry + exit). */
export function calculateCommission(
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    settings: CommissionSettings,
): number {
    return (
        calculateFillCommission(entryPrice, quantity, settings) +
        calculateFillCommission(exitPrice, quantity, settings)
    );
}

/**
 * Realised gross P/L of a position in the source currency, before commission.
 * For stocks the source's point value is 1, so this is price change × shares.
 * For futures it is price change × point value × contracts.
 */
export function calculateGrossProfitLoss(
    position: Pick<Position, "side" | "quantity" | "entryPrice" | "exitPrice">,
    currencyPerPoint: number,
): number {
    const exitPrice = position.exitPrice ?? position.entryPrice;
    const valuePerUnit = currencyPerPoint * position.quantity;

    return position.side === "long"
        ? (exitPrice - position.entryPrice) * valuePerUnit
        : (position.entryPrice - exitPrice) * valuePerUnit;
}

/**
 * Realised P/L of a closed position in the source currency, net of commission.
 * This is the app's single source of truth for trading maths and returns 0 for
 * positions without a realised exit.
 */
export function calculatePositionPL(
    position: Pick<Position, "state" | "side" | "quantity" | "entryPrice" | "exitPrice">,
    currencyPerPoint: number,
    commission: CommissionSettings,
): number {
    if (position.state !== "close" || position.exitPrice === undefined) {
        return 0;
    }

    return (
        calculateGrossProfitLoss(position, currencyPerPoint) -
        calculateCommission(
            position.entryPrice,
            position.exitPrice,
            position.quantity,
            commission,
        )
    );
}
