import {
    LineStyle,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type UTCTimestamp,
} from "lightweight-charts";

import { useEffect, useRef } from "react";

import type {
    Direction,
    EnterOrder,
    OrderType,
    Position,
    PositionPricePatch,
} from "@/types/position";
import type { PositionParamters } from "@/types/positionParamters";

type OrderMenu = {
    x: number;
    y: number;
};

type PriceLineKind = "entryPrice" | "stopLoss" | "takeProfit";

type PositionPriceLines = {
    entry: IPriceLine;
    stopLoss?: IPriceLine;
    takeProfit?: IPriceLine;
};

type DragTarget = {
    positionId: Position["id"];
    kind: PriceLineKind;
    pointerId: number;
    lastClientY: number;
    frame: number | null;
    initialEntryPrice: number;
    initialStopLoss?: number;
    initialTakeProfit?: number;
};

type ChartTradingProps = {
    orderMenu: OrderMenu | null;
    seriesApi: ISeriesApi<"Candlestick", UTCTimestamp>;
    chartApi: IChartApi;
    positionParamtersRef: React.RefObject<PositionParamters>;
    positions: Position[];
    lineEditMode: boolean;

    onClose: () => void;
    close: {
        (
            position: Position,
        ): void;
        (
            position: Position,
            exitPrice: number,
        ): void;
    };
    enter: (order: EnterOrder) => void;
    updatePositionPrices: (
        id: Position["id"],
        patch: PositionPricePatch,
    ) => void;
};

const HIT_THRESHOLD_PX = 8;
const HOVER_CLASS = "chart-order-line-hover";
const DRAG_CLASS = "chart-order-line-dragging";

const LONG_COLOR = "#26a69a";
const SHORT_COLOR = "#ef5350";
const STOP_LOSS_COLOR = "#ef5350";
const TAKE_PROFIT_COLOR = "#26a69a";

export function ChartTrading({
    orderMenu,
    onClose,
    seriesApi,
    chartApi,
    positions,
    positionParamtersRef,
    lineEditMode,
    enter,
    updatePositionPrices,
}: ChartTradingProps) {
    const positionLines = useRef<Map<string, PositionPriceLines>>(new Map());

    // Native pointer listeners are attached once per chart; these refs keep
    // them working against the latest render without re-subscribing.
    const positionsRef = useRef(positions);
    const updatePositionPricesRef = useRef(updatePositionPrices);
    const lineEditModeRef = useRef(lineEditMode);
    const dragRef = useRef<DragTarget | null>(null);

    positionsRef.current = positions;
    updatePositionPricesRef.current = updatePositionPrices;
    lineEditModeRef.current = lineEditMode;

    // Safety net: an interrupted drag must never leave the chart's native
    // navigation disabled. This also recovers hot-reloaded sessions.
    useEffect(() => {
        try {
            chartApi.applyOptions({
                handleScroll: true,
                handleScale: true,
            });
        } catch {
            // The chart may already be disposed while unmounting.
        }
    }, [chartApi]);

    const getPriceFormat = () => seriesApi.options().priceFormat;

    const getTickSize = () => {
        const minMove = getPriceFormat().minMove;
        return minMove > 0 ? minMove : 0.01;
    };

    const getPricePrecision = () => {
        const format = getPriceFormat();
        return format.type === "custom" ? 2 : format.precision;
    };

    const roundPrice = (price: number) => {
        const tick = getTickSize();
        return Number(
            (Math.round(price / tick) * tick).toFixed(getPricePrecision()),
        );
    };

    /**
     * Bracket legs stay on the correct side of the entry (long SL below, TP
     * above; reversed for shorts). The entry line itself moves freely.
     */
    const constrainPrice = (
        position: Position,
        kind: PriceLineKind,
        price: number,
    ) => {
        if (kind === "entryPrice") {
            return roundPrice(price);
        }

        const tick = getTickSize();

        if (kind === "stopLoss") {
            return position.side === "long"
                ? roundPrice(Math.min(price, position.entryPrice - tick))
                : roundPrice(Math.max(price, position.entryPrice + tick));
        }

        return position.side === "long"
            ? roundPrice(Math.max(price, position.entryPrice + tick))
            : roundPrice(Math.min(price, position.entryPrice - tick));
    };

    // The pointer effect is subscribed once; keep its price clamp current.
    const constrainPriceRef = useRef(constrainPrice);
    const roundPriceRef = useRef(roundPrice);
    constrainPriceRef.current = constrainPrice;
    roundPriceRef.current = roundPrice;

    // Keep price lines alive across position updates. Dragging changes state
    // every animation frame, so lines are updated in place instead of being
    // torn down and recreated.
    const positionsKey = JSON.stringify(positions);

    useEffect(() => {
        const lineMap = positionLines.current;
        const activeIds = new Set<string>();

        for (const position of positionsRef.current) {
            if (position.state === "close") {
                continue;
            }

            activeIds.add(position.id);

            let lines = lineMap.get(position.id);

            const entryOptions = {
                price: position.entryPrice,
                color:
                    position.side === "long"
                        ? LONG_COLOR
                        : SHORT_COLOR,
                lineWidth: 2 as const,
                lineStyle:
                    position.state === "waiting"
                        ? LineStyle.Dashed
                        : LineStyle.Solid,
                axisLabelVisible: true,
                title: `${position.state === "waiting"
                    ? "Stop"
                    : "Entry"} (${position.quantity ?? 1})`,
            };

            if (!lines) {
                lines = {
                    entry: seriesApi.createPriceLine({
                        id: `${position.id}:entryPrice`,
                        ...entryOptions,
                    }),
                };
                lineMap.set(position.id, lines);
            } else {
                lines.entry.applyOptions(entryOptions);
            }

            if (position.stopLoss !== undefined) {
                if (lines.stopLoss === undefined) {
                    lines.stopLoss = seriesApi.createPriceLine({
                        id: `${position.id}:stopLoss`,
                        price: position.stopLoss,
                        color: STOP_LOSS_COLOR,
                        lineWidth: 1,
                        lineStyle: LineStyle.Dashed,
                        axisLabelVisible: true,
                        title: "SL",
                    });
                } else {
                    lines.stopLoss.applyOptions({
                        price: position.stopLoss,
                    });
                }
            } else if (lines.stopLoss !== undefined) {
                seriesApi.removePriceLine(lines.stopLoss);
                lines.stopLoss = undefined;
            }

            if (position.takeProfit !== undefined) {
                if (lines.takeProfit === undefined) {
                    lines.takeProfit = seriesApi.createPriceLine({
                        id: `${position.id}:takeProfit`,
                        price: position.takeProfit,
                        color: TAKE_PROFIT_COLOR,
                        lineWidth: 1,
                        lineStyle: LineStyle.Dashed,
                        axisLabelVisible: true,
                        title: "TP",
                    });
                } else {
                    lines.takeProfit.applyOptions({
                        price: position.takeProfit,
                    });
                }
            } else if (lines.takeProfit !== undefined) {
                seriesApi.removePriceLine(lines.takeProfit);
                lines.takeProfit = undefined;
            }
        }

        for (const [id, lines] of lineMap) {
            if (activeIds.has(id)) {
                continue;
            }

            seriesApi.removePriceLine(lines.entry);

            if (lines.stopLoss !== undefined) {
                seriesApi.removePriceLine(lines.stopLoss);
            }

            if (lines.takeProfit !== undefined) {
                seriesApi.removePriceLine(lines.takeProfit);
            }

            lineMap.delete(id);
        }
    }, [positionsKey, seriesApi]);

    // Remove leftover lines when the series/chart goes away.
    useEffect(() => {
        const lineMap = positionLines.current;

        return () => {
            for (const lines of lineMap.values()) {
                seriesApi.removePriceLine(lines.entry);

                if (lines.stopLoss !== undefined) {
                    seriesApi.removePriceLine(lines.stopLoss);
                }

                if (lines.takeProfit !== undefined) {
                    seriesApi.removePriceLine(lines.takeProfit);
                }
            }
            lineMap.clear();
        };
    }, [seriesApi]);

    // Hover and Shift+drag handling: the pending entry line is editable while
    // waiting, and SL/TP remain editable after the entry fills.
    useEffect(() => {
        const chartElement = chartApi.chartElement();

        if (!chartElement) {
            return;
        }

        const getPaneTop = () => {
            const paneElement = seriesApi.getPane().getHTMLElement();
            return paneElement
                ? paneElement.getBoundingClientRect().top
                : chartElement.getBoundingClientRect().top;
        };

        const findLineAt = (
            clientY: number,
        ): { positionId: Position["id"]; kind: PriceLineKind } | null => {
            const paneY = clientY - getPaneTop();
            let best:
                | { positionId: Position["id"]; kind: PriceLineKind }
                | null = null;
            let bestDistance = HIT_THRESHOLD_PX;

            for (const position of positionsRef.current) {
                if (position.state === "close") {
                    continue;
                }

                const candidates: Array<
                    [PriceLineKind, number | undefined]
                > = [];

                if (position.state === "waiting") {
                    candidates.push(["entryPrice", position.entryPrice]);
                }

                candidates.push(
                    ["stopLoss", position.stopLoss],
                    ["takeProfit", position.takeProfit],
                );

                for (const [kind, price] of candidates) {
                    if (price === undefined) {
                        continue;
                    }

                    const lineY = seriesApi.priceToCoordinate(price);

                    if (lineY === null) {
                        continue;
                    }

                    const distance = Math.abs(lineY - paneY);

                    if (distance <= bestDistance) {
                        bestDistance = distance;
                        best = { positionId: position.id, kind };
                    }
                }
            }

            return best;
        };

        // Prevent the chart's mousedown-driven pan without touching its
        // persistent scroll/scale options.
        const stopChartPress = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };

        // Touch has its own pan handlers in lightweight-charts. Suppress
        // them only when a touch starts on an editable line in edit mode, or
        // while a line drag is already in progress.
        const stopChartTouchStart = (event: TouchEvent) => {
            if (!lineEditModeRef.current) {
                return;
            }

            const touch = event.touches[0];

            if (touch === undefined || findLineAt(touch.clientY) === null) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
        };

        const stopChartTouchMove = (event: TouchEvent) => {
            if (dragRef.current === null) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
        };

        const endDrag = () => {
            const drag = dragRef.current;

            if (drag === null) {
                return;
            }

            if (drag.frame !== null) {
                cancelAnimationFrame(drag.frame);
            }

            chartElement.removeEventListener("mousedown", stopChartPress, true);

            try {
                chartElement.releasePointerCapture(drag.pointerId);
            } catch {
                // Pointer capture may already have been released by the browser.
            }

            dragRef.current = null;
            chartElement.classList.remove(DRAG_CLASS);
        };

        const applyDrag = () => {
            const drag = dragRef.current;

            if (drag === null) {
                return;
            }

            drag.frame = null;

            const position = positionsRef.current.find(
                (currentPosition) =>
                    currentPosition.id === drag.positionId &&
                    currentPosition.state !== "close",
            );

            if (
                position === undefined ||
                (drag.kind === "entryPrice" &&
                    position.state !== "waiting")
            ) {
                endDrag();
                return;
            }

            const paneY = drag.lastClientY - getPaneTop();
            const rawPrice = seriesApi.coordinateToPrice(paneY);

            if (rawPrice === null) {
                return;
            }

            const price = constrainPriceRef.current(
                position,
                drag.kind,
                Number(rawPrice),
            );

            // Apply immediately so the line stays under the cursor, then let
            // the state update flow through the normal reconciliation effect.
            const lines = positionLines.current.get(position.id);
            const line =
                drag.kind === "entryPrice"
                    ? lines?.entry
                    : drag.kind === "stopLoss"
                        ? lines?.stopLoss
                        : lines?.takeProfit;

            line?.applyOptions({ price });

            let patch: PositionPricePatch;

            if (drag.kind === "entryPrice") {
                // Bracket legs are attached to the entry. Move them by the
                // same amount so they stay on the correct side of it while
                // the entry itself remains freely draggable.
                const delta = price - drag.initialEntryPrice;
                patch = { entryPrice: price };

                if (drag.initialStopLoss !== undefined) {
                    patch.stopLoss = roundPriceRef.current(
                        drag.initialStopLoss + delta,
                    );
                }

                if (drag.initialTakeProfit !== undefined) {
                    patch.takeProfit = roundPriceRef.current(
                        drag.initialTakeProfit + delta,
                    );
                }
            } else if (drag.kind === "stopLoss") {
                patch = { stopLoss: price };
            } else {
                patch = { takeProfit: price };
            }

            updatePositionPricesRef.current(position.id, patch);
        };

        const onPointerMove = (event: PointerEvent) => {
            const drag = dragRef.current;

            if (drag !== null) {
                // Recover if a release happened outside the window and the
                // pointerup never reached us: no buttons means the gesture
                // is already over.
                if (event.pointerType === "mouse" && event.buttons === 0) {
                    endDrag();
                    return;
                }

                drag.lastClientY = event.clientY;

                if (drag.frame === null) {
                    drag.frame = requestAnimationFrame(applyDrag);
                }
                return;
            }

            // The resize cursor appears while Shift is held or line-edit
            // mode is toggled on (the mobile equivalent).
            const editEnabled = event.shiftKey || lineEditModeRef.current;
            const hit = editEnabled ? findLineAt(event.clientY) : null;
            chartElement.classList.toggle(HOVER_CLASS, hit !== null);
        };

        const onPointerLeave = () => {
            if (dragRef.current !== null) {
                return;
            }

            chartElement.classList.remove(HOVER_CLASS);
        };

        const onPointerDown = (event: PointerEvent) => {
            if (!event.isPrimary) {
                return;
            }

            if (event.pointerType === "mouse" && event.button !== 0) {
                return;
            }

            // A new primary press always clears any interrupted drag, even if
            // this press is not itself a line edit.
            if (dragRef.current !== null) {
                endDrag();
            }

            // Line editing is modifier-gated so normal chart panning and
            // touchpad gestures are never intercepted. The on-screen toggle
            // is the mobile equivalent of holding Shift.
            if (!event.shiftKey && !lineEditModeRef.current) {
                return;
            }

            const hit = findLineAt(event.clientY);

            if (hit === null) {
                return;
            }

            const position = positionsRef.current.find(
                (currentPosition) =>
                    currentPosition.id === hit.positionId &&
                    currentPosition.state !== "close",
            );

            if (position === undefined) {
                return;
            }

            // Shift+drag (or edit mode) is an explicit line edit. Stop the
            // chart's own pan gesture and take over the pointer.
            event.preventDefault();
            event.stopPropagation();

            dragRef.current = {
                positionId: hit.positionId,
                kind: hit.kind,
                pointerId: event.pointerId,
                lastClientY: event.clientY,
                frame: null,
                initialEntryPrice: position.entryPrice,
                initialStopLoss: position.stopLoss,
                initialTakeProfit: position.takeProfit,
            };

            try {
                chartElement.setPointerCapture(event.pointerId);
            } catch {
                // Pointer capture is a nicety; dragging still works without it.
            }

            chartElement.classList.remove(HOVER_CLASS);
            chartElement.classList.add(DRAG_CLASS);

            chartElement.addEventListener("mousedown", stopChartPress, true);
        };

        const onPointerUp = () => {
            endDrag();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                endDrag();
            }
        };

        chartElement.addEventListener("pointermove", onPointerMove);
        chartElement.addEventListener("pointerdown", onPointerDown);
        chartElement.addEventListener("pointerleave", onPointerLeave);
        chartElement.addEventListener("lostpointercapture", onPointerUp);
        chartElement.addEventListener("touchstart", stopChartTouchStart, {
            capture: true,
            passive: false,
        });
        chartElement.addEventListener("touchmove", stopChartTouchMove, {
            capture: true,
            passive: false,
        });
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
        window.addEventListener("blur", onPointerUp);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            endDrag();
            chartElement.classList.remove(HOVER_CLASS);
            chartElement.removeEventListener("pointermove", onPointerMove);
            chartElement.removeEventListener("pointerdown", onPointerDown);
            chartElement.removeEventListener("pointerleave", onPointerLeave);
            chartElement.removeEventListener(
                "lostpointercapture",
                onPointerUp,
            );
            chartElement.removeEventListener(
                "touchstart",
                stopChartTouchStart,
                true,
            );
            chartElement.removeEventListener(
                "touchmove",
                stopChartTouchMove,
                true,
            );
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
            window.removeEventListener("blur", onPointerUp);
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
        };
    }, [seriesApi, chartApi]);

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

    const placeOrder = (direction: Direction, orderType: OrderType) => {
        const price = getPriceFromMenu();

        if (price === null) return;

        const { stopLossPoints, takeProfitPoints, quantity, bracket } =
            positionParamtersRef.current;

        const isLong = direction === "long";

        const stopLoss = bracket
            ? isLong ? price - stopLossPoints : price + stopLossPoints
            : undefined;

        const takeProfit = bracket
            ? isLong ? price + takeProfitPoints : price - takeProfitPoints
            : undefined;

        enter({
            direction,
            quantity,
            orderType,
            entryPrice: price,
            stopLoss,
            takeProfit,
        });

        onClose();
    };

    if (!orderMenu) return null;

    const menuPrice = getPriceFromMenu();

    return (
        <div
            className="
                fixed
                z-50
                w-52
                overflow-hidden
                rounded-lg
                border
                border-edge-strong
                bg-surface/95
                py-1
                shadow-2xl
                shadow-black/50
                backdrop-blur
            "
            style={{
                left: orderMenu.x,
                top: orderMenu.y,
            }}
            onClick={(event) => {
                event.stopPropagation();
            }}
        >
            <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                    Place order
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                    {menuPrice === null ? "—" : menuPrice.toFixed(2)}
                </span>
            </div>

            <button
                type="button"
                className="
                    flex
                    w-full
                    items-center
                    gap-2
                    px-3
                    py-2
                    text-left
                    text-sm
                    text-ink
                    transition
                    hover:bg-bull/10
                "
                onClick={() => placeOrder("long", "stop")}
            >
                <span className="h-1.5 w-1.5 rounded-full bg-bull" />
                Buy Stop
            </button>

            <button
                type="button"
                className="
                    flex
                    w-full
                    items-center
                    gap-2
                    px-3
                    py-2
                    text-left
                    text-sm
                    text-ink
                    transition
                    hover:bg-bear/10
                "
                onClick={() => placeOrder("short", "stop")}
            >
                <span className="h-1.5 w-1.5 rounded-full bg-bear" />
                Sell Stop
            </button>

        </div>
    );
}
