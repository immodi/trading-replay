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
                    pointDollarValue * position.quantity
                );

            case "short":
                return (
                    (position.entryPrice - position.exitPrice) *
                    pointDollarValue * position.quantity
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
                                &&
                                priceData.Low <=
                                position.entryPrice
                            ) {
                                position.state = "open";
                            }
                            break;

                        case "short":
                            if (
                                priceData.Low <=
                                position.entryPrice
                                &&
                                priceData.High >=
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

    function enter(direction: Direction, quantity: number): void;

    function enter(
        direction: Direction,
        quantity: number,
        stopLoss: number,
        takeProfit: number,
    ): void;

    function enter(
        direction: Direction,
        quantity: number,
        entryPrice: number,
        stopLoss: number,
        takeProfit: number,
    ): void;

    function enter(
        direction: Direction,
        quantity: number,
        arg3?: number,
        arg4?: number,
        arg5?: number,
    ) {
        const hasEntryPrice = arg5 !== undefined;

        const entryPrice = hasEntryPrice
            ? arg3
            : priceData.Price;

        const stopLoss = hasEntryPrice
            ? arg4
            : arg3;

        const takeProfit = hasEntryPrice
            ? arg5
            : arg4;

        const position: Position = {
            id: crypto.randomUUID(),
            side: direction,
            quantity,
            entryPrice,
            entryTime: priceData.Time,
            state: hasEntryPrice
                ? "waiting"
                : "open",
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
                if (
                    currentPosition.entryTime !==
                    position.entryTime
                    ||
                    currentPosition.entryPrice !==
                    position.entryPrice
                ) {
                    return currentPosition;
                }

                const positionExitPrice = exitPrice ? exitPrice : priceData.Price;
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
    };
}
