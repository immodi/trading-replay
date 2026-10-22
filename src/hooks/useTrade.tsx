import type { EnterOrder, Position, PositionPricePatch } from "@/types/position";
import type { PriceData } from "@/types/priceData";
import { calculatePositionPL } from "@/utils/calculatePositionPL";
import { useEffect, useRef, useState } from "react";

export function useTrade(
    priceData: PriceData,
    pointDollarValue: number,
    commissionPerContract: number = 0,
    initialPositions: Position[] = [],
    /** False while the replay is still being restored; price checks are paused. */
    isReady: boolean = true,
) {
    const [positions, setPositions] = useState<Position[]>(
        () => initialPositions,
    );
    const [pl, setPL] = useState(0);

    useEffect(() => {
        const totalPL = positions.reduce(
            (total, position) =>
                total + calculatePositionPL(position, pointDollarValue, commissionPerContract),
            0,
        );

        setPL(totalPL);
    }, [JSON.stringify(positions), pointDollarValue, commissionPerContract]);

    const prevPriceRef = useRef<PriceData | null>(null);

    useEffect(() => {
        // Restored positions must not be evaluated against the empty/history
        // price before the replay has been restored to its saved point.
        if (!isReady) {
            prevPriceRef.current = null;
            return;
        }

        const prevPrice = prevPriceRef.current;
        prevPriceRef.current = priceData;

        // Seed the comparison once real replay data exists instead of treating
        // the jump from "no data" as a price move that triggers orders.
        if (prevPrice === null || prevPrice.Time === 0 || priceData.Time === 0) {
            return;
        }

        setPositions((currentPositions) => {
            const updatedPositions = [...currentPositions];

            for (const position of updatedPositions) {
                if (position.state === "waiting") {

                    // Fire only when price crosses the stop, not when it's merely beyond it
                    const triggered =
                        // new high reached the level (came from below)
                        (prevPrice.High < position.entryPrice && priceData.High >= position.entryPrice) ||
                        // new low reached the level (came from above)
                        (prevPrice.Low > position.entryPrice && priceData.Low <= position.entryPrice) ||
                        // price crossed or hit the level between updates (covers gaps and new bars)
                        (prevPrice.Price - position.entryPrice) * (priceData.Price - position.entryPrice) <= 0;

                    if (triggered) {
                        position.state = "open";
                    }
                }

                if (position.state !== "open") {
                    continue;
                }

                switch (position.side) {
                    case "long": {
                        const hitTP =
                            position.takeProfit !== undefined &&
                            priceData.High >=
                            position.takeProfit;

                        const hitSL =
                            position.stopLoss !== undefined &&
                            priceData.Low <=
                            position.stopLoss;

                        if (hitTP && hitSL) {
                            close(
                                position,
                                position.stopLoss!,
                            );
                        } else if (hitSL) {
                            close(
                                position,
                                position.stopLoss!,
                            );
                        } else if (hitTP) {
                            close(
                                position,
                                position.takeProfit!,
                            );
                        }

                        break;
                    }

                    case "short": {
                        const hitTP =
                            position.takeProfit !== undefined &&
                            priceData.Low <=
                            position.takeProfit;

                        const hitSL =
                            position.stopLoss !== undefined &&
                            priceData.High >=
                            position.stopLoss;

                        if (hitTP && hitSL) {
                            close(
                                position,
                                position.stopLoss!,
                            );
                        } else if (hitSL) {
                            close(
                                position,
                                position.stopLoss!,
                            );
                        } else if (hitTP) {
                            close(
                                position,
                                position.takeProfit!,
                            );
                        }

                        break;
                    }
                }
            }

            return updatedPositions;
        });
    }, [priceData.Price, priceData.Time, isReady]);

    function enter(order: EnterOrder) {
        const {
            direction,
            quantity,
            orderType = "market",
            stopLoss,
            takeProfit,
        } = order;

        const entryPrice =
            order.entryPrice !== undefined
                ? order.entryPrice
                : priceData.Price;

        const position: Position = {
            id: crypto.randomUUID(),
            side: direction,
            quantity,
            orderType,
            entryPrice,
            entryTime: priceData.Time,
            state: orderType === "market"
                ? "open"
                : "waiting",
        };

        if (stopLoss !== undefined) {
            position.stopLoss = stopLoss;
        }

        if (takeProfit !== undefined) {
            position.takeProfit = takeProfit;
        }

        setPositions((current) => [
            ...current,
            position,
        ]);
    }


    function close(position: Position): void;
    function close(position: Position, exitPrice: number): void;
    function close(
        position: Position,
        exitPrice?: number,
    ) {
        setPositions((currentPositions) =>
            currentPositions.map((currentPosition) => {
                // Match on id: positions sharing an entry time/price must not
                // be closed (or have their realised exit price rewritten) together.
                if (currentPosition.id !== position.id) {
                    return currentPosition;
                }

                // Never re-close a position: that would overwrite its realised P/L.
                if (currentPosition.state === "close") {
                    return currentPosition;
                }

                const positionExitPrice = exitPrice ?? priceData.Price;
                return {
                    ...currentPosition,
                    state: "close",
                    exitTime: priceData.Time,
                    exitPrice: currentPosition.state !== "waiting" ? positionExitPrice : undefined,
                };
            }),
        );
    }

    function closeAll() {
        setPositions((currentPositions) => {
            const updatedPositions =
                currentPositions.map((position) => {
                    if (position.state === "close") {
                        return position;
                    }

                    return {
                        ...position,
                        state: "close" as const,
                        exitTime: priceData.Time,
                        exitPrice: position.state !== "waiting" ? priceData.Price : undefined,
                    };
                });

            return updatedPositions;
        });
    }

    /**
     * Live-edit a position from its chart price lines. The entry can only be
     * moved while the order is pending; SL/TP stay editable once it is open.
     */
    function updatePositionPrices(
        id: Position["id"],
        patch: PositionPricePatch,
    ) {
        setPositions((current) =>
            current.map((position) => {
                if (position.id !== id || position.state === "close") {
                    return position;
                }

                if (
                    patch.entryPrice !== undefined &&
                    position.state !== "waiting"
                ) {
                    return position;
                }

                return { ...position, ...patch };
            }),
        );
    }

    function reset() {
        setPositions((prev) =>
            prev.filter((position) => position.state !== "close"),
        );
    }

    return {
        positions,
        pl,

        enter,
        close,
        closeAll,
        reset,
        updatePositionPrices,
    };
}
