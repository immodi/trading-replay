import type { Direction, Position } from "@/types/position";
import type { PriceData } from "@/types/priceData";
import { useEffect, useRef } from "react";

export function useTrade(priceData: PriceData, pointDollarValue: number) {
    const positions = useRef<Position[]>([]);
    const pl = useRef<number>(0);

    const calculatePL = (position: Position): number => {
        if (position.exitPrice === undefined) return 0;

        switch (position.side) {
            case "long":
                return (position.exitPrice - position.entryPrice) * pointDollarValue;

            case "short":
                return (position.entryPrice - position.exitPrice) * pointDollarValue;
        }
    };

    useEffect(() => {
        positions.current.forEach(position => {
            if (position.state === "waiting") {
                switch (position.side) {
                    case "long":
                        if (priceData.High >= position.entryPrice) {
                            position.state = "open";
                        }
                        break;

                    case "short":
                        if (priceData.Low <= position.entryPrice) {
                            position.state = "open";
                        }
                        break;
                }
            }

            if (position.state !== "open") return;
            switch (position.side) {
                case "long":
                    if (
                        (position.takeProfit !== undefined &&
                            priceData.High >= position.takeProfit) ||
                        (position.stopLoss !== undefined &&
                            priceData.Low <= position.stopLoss)
                    ) {
                        if (
                            (position.takeProfit !== undefined &&
                                priceData.High >= position.takeProfit) &&
                            (position.stopLoss !== undefined &&
                                priceData.Low <= position.stopLoss)
                        ) {

                            // Conservative: assume SL was hit first.
                            close(position, { exitPrice: position.stopLoss })
                            return;
                        }
                        close(position, { exitPrice: position.takeProfit });
                    }
                    break;

                case "short":
                    if (
                        (position.takeProfit !== undefined &&
                            priceData.Low <= position.takeProfit) ||
                        (position.stopLoss !== undefined &&
                            priceData.High >= position.stopLoss)
                    ) {

                        if (
                            (position.takeProfit !== undefined &&
                                priceData.Low <= position.takeProfit) &&
                            (position.stopLoss !== undefined &&
                                priceData.High >= position.stopLoss)
                        ) {

                            // Conservative: assume SL was hit first.
                            close(position, { exitPrice: position.stopLoss })
                            return;
                        }
                        close(position, { exitPrice: position.takeProfit });
                    }
                    break;
            }
        });
    }, [priceData.Price, priceData.Time]);

    function enter(direction: Direction): void;
    function enter(direction: Direction, entryPrice: number, stopLoss: number, takeProfit: number): void;
    function enter(direction: Direction, entryPrice?: number, stopLoss?: number, takeProfit?: number) {
        const position: Position = {
            side: direction,
            entryPrice: priceData.Price,
            entryTime: priceData.Time,
            state: "open",
        };

        if (
            entryPrice !== undefined &&
            stopLoss !== undefined &&
            takeProfit !== undefined
        ) {
            position.state = "waiting";
            position.entryPrice = entryPrice;
            position.stopLoss = stopLoss;
            position.takeProfit = takeProfit;
        }

        positions.current.push(position);
    }



    function close(): void;
    function close(position: Position): void;
    function close(position: Position, override: Partial<Position>): void;
    function close(position?: Position, override?: Partial<Position>) {
        if (!position) {
            // close all 
            for (let i = 0; i < positions.current.length; i++) {
                const pos = positions.current.at(i)
                if (!pos || pos.state === "close") continue;

                pos.state = "close";
                pos.exitTime = priceData.Time;
                pos.exitPrice = priceData.Price;
                pl.current += calculatePL(pos);
            }
            return
        }

        Object.assign(position, {
            state: "close",
            exitTime: priceData.Time,
            ...override,
        });

        pl.current += calculatePL(position);
    }


    function resetPL() {
        pl.current = 0;
    }

    return {
        positions: positions.current,
        pl: pl.current,
        enter,
        close,
        resetPL,
    };

}
