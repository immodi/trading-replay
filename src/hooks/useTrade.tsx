import type { Direction, Position } from "@/types/position";
import type { PriceData } from "@/types/priceData";
import { useEffect, useState } from "react";

export function useTrade(
    priceData: PriceData,
    pointDollarValue: number,
) {
    const [positions, setPositions] = useState<Position[]>([]);
    const [pl, setPL] = useState(0);

    const calculatePL = (
        position: Position,
    ): number => {
        if (
            position.state !== "close" ||
            position.exitPrice === undefined
        ) {
            return 0;
        }

        switch (position.side) {
            case "long":
                return (
                    (position.exitPrice - position.entryPrice) *
                    pointDollarValue
                );

            case "short":
                return (
                    (position.entryPrice - position.exitPrice) *
                    pointDollarValue
                );
        }
    };


    useEffect(() => {
        const totalPL = positions.reduce(
            (total, position) =>
                total + calculatePL(position),
            0,
        );

        setPL(totalPL);
    }, [JSON.stringify(positions), pointDollarValue]);

    useEffect(() => {
        setPositions((currentPositions) => {
            const updatedPositions = [...currentPositions];

            for (const position of updatedPositions) {
                if (position.state === "waiting") {
                    switch (position.side) {
                        case "long":
                            if (
                                priceData.High >=
                                position.entryPrice
                            ) {
                                position.state = "open";
                            }
                            break;

                        case "short":
                            if (
                                priceData.Low <=
                                position.entryPrice
                            ) {
                                position.state = "open";
                            }
                            break;
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
    }, [priceData.Price, priceData.Time]);

    function enter(direction: Direction): void;

    function enter(
        direction: Direction,
        entryPrice: number,
        stopLoss: number,
        takeProfit: number,
    ): void;

    function enter(
        direction: Direction,
        entryPrice?: number,
        stopLoss?: number,
        takeProfit?: number,
    ) {
        const position: Position = {
            side: direction,
            entryPrice:
                entryPrice ?? priceData.Price,
            entryTime: priceData.Time,
            state:
                entryPrice !== undefined
                    ? "waiting"
                    : "open",
        };

        if (
            entryPrice !== undefined &&
            stopLoss !== undefined &&
            takeProfit !== undefined
        ) {
            position.stopLoss = stopLoss;
            position.takeProfit = takeProfit;
        }

        setPositions((current) => [
            ...current,
            position,
        ]);
    }

    function close(
        position: Position,
        exitPrice: number,
    ) {
        setPositions((currentPositions) =>
            currentPositions.map((currentPosition) => {
                if (
                    currentPosition.entryTime !==
                    position.entryTime
                ) {
                    return currentPosition;
                }

                return {
                    ...currentPosition,
                    state: "close",
                    exitTime: priceData.Time,
                    exitPrice,
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
                        exitPrice: priceData.Price,
                    };
                });

            return updatedPositions;
        });
    }

    function resetPL() {
        setPositions([]);
    }

    return {
        positions,
        pl,

        enter,
        close,
        closeAll,
        resetPL,
    };
}
