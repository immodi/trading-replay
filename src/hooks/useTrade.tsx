import type { EnterOrder, Position, PositionPricePatch } from "@/types/position";
import type { PriceData } from "@/types/priceData";
import { applyPriceTick } from "@/utils/applyPriceTick";
import { calculatePositionPL } from "@/utils/calculatePositionPL";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Deep-enough copy so a rewound snapshot never aliases live state. */
function clonePositions(positions: Position[]): Position[] {
    return positions.map((position) => ({ ...position }));
}

type CommitOptions = {
    /** Drop cached snapshots after the current index; they belong to a future that no longer exists. */
    invalidateFuture?: boolean;
    /** Store the committed positions as the snapshot for `atIndex`. */
    recordSnapshot?: boolean;
};

export function useTrade(
    priceData: PriceData,
    pointDollarValue: number,
    commissionPerContract: number = 0,
    initialPositions: Position[] = [],
    /** False while the replay is still being restored; price checks are paused. */
    isReady: boolean = true,
    /** Raw-candle index of the replay tick currently being displayed. */
    replayIndex: number = 0,
) {
    const [positions, setPositions] = useState<Position[]>(
        () => clonePositions(initialPositions),
    );

    const positionsRef = useRef<Position[]>(positions);
    const snapshotsRef = useRef<Map<number, Position[]>>(new Map());
    const indexRef = useRef<number>(replayIndex);
    const prevPriceRef = useRef<PriceData | null>(null);

    const pl = useMemo(
        () =>
            positions.reduce(
                (total, position) =>
                    total +
                    calculatePositionPL(
                        position,
                        pointDollarValue,
                        commissionPerContract,
                    ),
                0,
            ),
        [positions, pointDollarValue, commissionPerContract],
    );

    const commitPositions = useCallback(
        (
            next: Position[],
            atIndex: number,
            {
                invalidateFuture = true,
                recordSnapshot = true,
            }: CommitOptions = {},
        ) => {
            positionsRef.current = next;
            setPositions(next);

            if (!recordSnapshot) return;

            if (invalidateFuture) {
                for (const key of snapshotsRef.current.keys()) {
                    if (key > atIndex) {
                        snapshotsRef.current.delete(key);
                    }
                }
            }

            snapshotsRef.current.set(atIndex, clonePositions(next));
        },
        [],
    );

    useEffect(() => {
        const previousIndex = indexRef.current;
        indexRef.current = replayIndex;

        // Restored positions must not be evaluated against the empty/history
        // price before the replay has been restored to its saved point.
        if (!isReady) {
            prevPriceRef.current = null;
            return;
        }

        // Rewinding only restores the snapshot belonging to the target tick.
        // No order is evaluated while the replay moves backwards.
        if (replayIndex < previousIndex) {
            const snapshot = snapshotsRef.current.get(replayIndex);

            commitPositions(
                snapshot === undefined ? [] : clonePositions(snapshot),
                replayIndex,
                {
                    invalidateFuture: false,
                    recordSnapshot: snapshot === undefined,
                },
            );
            prevPriceRef.current = priceData;
            return;
        }

        // The replay index identifies a tick. A same-index render (for
        // example after a manual edit) must not re-run order execution.
        if (replayIndex === previousIndex) {
            if (prevPriceRef.current === null) {
                prevPriceRef.current = priceData;
                commitPositions(positionsRef.current, replayIndex, {
                    invalidateFuture: false,
                });
            }
            return;
        }

        const prevPrice = prevPriceRef.current;

        // Seed the comparison once real replay data exists instead of treating
        // the jump from "no data" as a price move that triggers orders.
        if (prevPrice === null || prevPrice.Time === 0 || priceData.Time === 0) {
            prevPriceRef.current = priceData;
            commitPositions(positionsRef.current, replayIndex);
            return;
        }

        const next = applyPriceTick(positionsRef.current, prevPrice, priceData);

        prevPriceRef.current = priceData;
        commitPositions(next, replayIndex);
    }, [
        priceData,
        priceData.Price,
        priceData.High,
        priceData.Low,
        priceData.Time,
        isReady,
        replayIndex,
        commitPositions,
    ]);

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

        commitPositions([...positionsRef.current, position], replayIndex);
    }


    function close(position: Position): void;
    function close(position: Position, exitPrice: number): void;
    function close(
        position: Position,
        exitPrice?: number,
    ) {
        const next = positionsRef.current.map((currentPosition) => {
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
                state: "close" as const,
                exitTime: priceData.Time,
                exitPrice: currentPosition.state !== "waiting" ? positionExitPrice : undefined,
            };
        });

        commitPositions(next, replayIndex);
    }

    function closeAll() {
        const next = positionsRef.current.map((position) => {
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

        commitPositions(next, replayIndex);
    }

    /**
     * Live-edit a position from its chart price lines. The entry can only be
     * moved while the order is pending; SL/TP stay editable once it is open.
     */
    function updatePositionPrices(
        id: Position["id"],
        patch: PositionPricePatch,
    ) {
        const next = positionsRef.current.map((position) => {
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
        });

        commitPositions(next, replayIndex);
    }

    /**
     * Clear every working order and position and forget the rewind history.
     * A date/source change starts an independent replay, so nothing from the
     * previous day may be evaluated against the new day's prices.
     */
    function reset() {
        snapshotsRef.current.clear();
        prevPriceRef.current = null;
        commitPositions([], replayIndex, { invalidateFuture: false });
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
