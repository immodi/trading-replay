import type { Position } from "@/types/position";
import type { PriceData } from "@/types/priceData";

/**
 * Evaluate pending stop entries and open bracket exits for one replay tick.
 *
 * The function is pure: it returns the position list for the *current* tick
 * without mutating its input. Callers are responsible for snapshotting the
 * result against the replay index so a rewind can restore it.
 */
export function applyPriceTick(
    positions: Position[],
    previous: PriceData,
    current: PriceData,
): Position[] {
    return positions.map((position) => {
        let next = position;

        // Stop entries are direction-aware: a buy stop fills on an upward
        // cross through its level, a sell stop on a downward cross.
        if (next.state === "waiting") {
            const level = next.entryPrice;

            const triggered =
                next.side === "long"
                    ? (previous.High < level && current.High >= level) ||
                      (previous.Price < level && current.Price >= level)
                    : (previous.Low > level && current.Low <= level) ||
                      (previous.Price > level && current.Price <= level);

            if (triggered) {
                next = { ...next, state: "open" };
            }
        }

        if (next.state !== "open") {
            return next;
        }

        const { takeProfit, stopLoss } = next;

        if (next.side === "long") {
            const hitTP =
                takeProfit !== undefined && current.High >= takeProfit;
            const hitSL = stopLoss !== undefined && current.Low <= stopLoss;

            if (hitSL) {
                return closeAt(next, stopLoss!, current);
            }

            if (hitTP) {
                return closeAt(next, takeProfit!, current);
            }

            return next;
        }

        const hitTP = takeProfit !== undefined && current.Low <= takeProfit;
        const hitSL = stopLoss !== undefined && current.High >= stopLoss;

        if (hitSL) {
            return closeAt(next, stopLoss!, current);
        }

        if (hitTP) {
            return closeAt(next, takeProfit!, current);
        }

        return next;
    });
}

/** Close a position at its configured bracket level for the current tick. */
function closeAt(
    position: Position,
    exitPrice: number,
    priceData: PriceData,
): Position {
    return {
        ...position,
        state: "close",
        exitPrice,
        exitTime: priceData.Time,
    };
}
