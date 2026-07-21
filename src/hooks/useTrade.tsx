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
                        if (priceData.CurrentPrice >= position.entryPrice) {
                            position.state = "open";
                        }
                        break;

                    case "short":
                        if (priceData.CurrentPrice <= position.entryPrice) {
                            position.state = "open";
                        }
                        break;
                }
            }

            if (position.state !== "open") return;
            switch (position.side) {
                case "long":
                    if (
                        position.takeProfit &&
                        priceData.CurrentPrice >= position.takeProfit
                        ||
                        position.stopLoss &&
                        priceData.CurrentPrice <= position.stopLoss
                    ) {
                        close(position);
                    }

                    break;

                case "short":
                    if (
                        position.takeProfit &&
                        priceData.CurrentPrice <= position.takeProfit
                        ||
                        position.stopLoss &&
                        priceData.CurrentPrice >= position.stopLoss

                    ) {
                        close(position);
                    }
                    break;
            }
        });
    }, [priceData.CurrentPrice, priceData.CurrentTime]);

    function enter(direction: Direction): void;
    function enter(direction: Direction, entryPrice: number, stopLoss: number, takeProfit: number): void;
    function enter(direction: Direction, entryPrice?: number, stopLoss?: number, takeProfit?: number) {
        const position: Position = {
            side: direction,
            entryPrice: priceData.CurrentPrice,
            entryTime: priceData.CurrentTime,
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
    function close(position?: Position) {
        if (!position) {
            // close all 
            for (let i = 0; i < positions.current.length; i++) {
                const position = positions.current.at(i)
                if (!position || position.state === "close") continue;

                position.state = "close";
                position.exitTime = priceData.CurrentTime;
                position.exitPrice = priceData.CurrentPrice;
                pl.current += calculatePL(position);
            }
            return
        }

        position.state = "close";
        position.exitTime = priceData.CurrentTime;
        position.exitPrice = priceData.CurrentPrice;
        pl.current += calculatePL(position);
        return;
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
