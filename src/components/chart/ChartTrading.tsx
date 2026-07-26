import {
    LineStyle,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
} from "lightweight-charts";

import { useEffect, useRef } from "react";

import type { Direction, Position } from "@/types/position";
import type { PositionParamters } from "@/types/positionParamters";

type OrderMenu = {
    x: number;
    y: number;
};

type ChartTradingProps = {
    orderMenu: OrderMenu | null;
    seriesApi: ISeriesApi<"Candlestick">;
    positionParamtersRef: React.RefObject<PositionParamters>;
    chartApi: IChartApi;
    positions: Position[];

    onClose: () => void;
    enter: (
        direction: Direction,
        quantity: number,
        entryPrice: number,
        stopLoss: number,
        takeProfit: number,
    ) => void;
};

export function ChartTrading({
    orderMenu,
    onClose,
    seriesApi,
    chartApi,
    positions,
    positionParamtersRef,
    enter,
}: ChartTradingProps) {
    const positionLines = useRef<Map<string, IPriceLine[]>>(new Map());

    const getPriceFromMenu = (): number | null => {
        if (!orderMenu) return null;

        const chartElement = chartApi.chartElement();
        if (!chartElement) return null;

        const rect = chartElement.getBoundingClientRect();
        const relativeY = orderMenu.y - rect.top;

        const price = seriesApi.coordinateToPrice(relativeY);

        if (price === null) return null;

        return Number(price.toFixed(2));
    };

    const handleBuyStop = () => {
        const price = getPriceFromMenu();

        if (price === null) return;

        const { stopLossPoints, takeProfitPoints, quantity } =
            positionParamtersRef.current;

        enter(
            "long",
            quantity,
            price,
            price - stopLossPoints,
            price + takeProfitPoints,
        );

        onClose();
    };

    const handleSellStop = () => {
        const price = getPriceFromMenu();

        if (price === null) return;

        const { stopLossPoints, takeProfitPoints, quantity } =
            positionParamtersRef.current;

        enter(
            "short",
            quantity,
            price,
            price + stopLossPoints,
            price - takeProfitPoints,
        );

        onClose();
    };

    useEffect(() => {
        // Remove existing position lines.
        for (const lines of positionLines.current.values()) {
            for (const line of lines) {
                seriesApi.removePriceLine(line);
            }
        }

        positionLines.current.clear();

        // Render lines for all active positions.
        for (const position of positions) {
            if (position.state === "close") {
                continue;
            }

            const lines: IPriceLine[] = [];

            const entryLine = seriesApi.createPriceLine({
                price: position.entryPrice,
                color:
                    position.side === "long"
                        ? "#26a69a"
                        : "#ef5350",
                lineWidth: 2,
                lineStyle: position.state === "waiting"
                    ? LineStyle.Dashed
                    : LineStyle.Solid,
                axisLabelVisible: true,
                title: `${position.state === "waiting" ? "Pending" : "Entry"} (${position.quantity ?? 1})`,
            });

            lines.push(entryLine);

            if (position.stopLoss !== undefined) {
                const stopLossLine =
                    seriesApi.createPriceLine({
                        price: position.stopLoss,
                        color: "#ef5350",
                        lineWidth: 1,
                        lineStyle: 2,
                        axisLabelVisible: true,
                        title: "SL",
                    });

                lines.push(stopLossLine);
            }

            if (position.takeProfit !== undefined) {
                const takeProfitLine =
                    seriesApi.createPriceLine({
                        price: position.takeProfit,
                        color: "#26a69a",
                        lineWidth: 1,
                        lineStyle: 2,
                        axisLabelVisible: true,
                        title: "TP",
                    });

                lines.push(takeProfitLine);
            }

            positionLines.current.set(
                position.entryTime.toString(),
                lines,
            );
        }

        return () => {
            for (const lines of positionLines.current.values()) {
                for (const line of lines) {
                    seriesApi.removePriceLine(line);
                }
            }

            positionLines.current.clear();
        };
    }, [positions, seriesApi]);

    if (!orderMenu) return null;

    return (
        <div
            className="fixed z-50 min-w-40 overflow-hidden rounded-md border border-[#363A45] bg-[#131722] py-1 shadow-xl"
            style={{
                left: orderMenu.x,
                top: orderMenu.y,
            }}
            onClick={(event) => {
                event.stopPropagation();
            }}
        >
            <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#1B2130]"
                onClick={handleBuyStop}
            >
                Buy Stop
            </button>

            <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#1B2130]"
                onClick={handleSellStop}
            >
                Sell Stop
            </button>

        </div>
    );
}
