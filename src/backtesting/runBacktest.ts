import { MAX_ACTIONS_PER_BAR, MAX_CONTRACTS_PER_ENTRY } from "./constants";
import { computeSummary } from "./metrics";
import { formatUtcDate, formatUtcDateTime } from "./range";
import type {
    AccountContext,
    BacktestBar,
    BacktestResult,
    BacktestRunConfig,
    BarContext,
    ClosedTrade,
    EnterAction,
    EquityPoint,
    ExitAction,
    ExitAllAction,
    ExitReason,
    HistoryApi,
    ModifyAction,
    OpenPositionView,
    StrategyAction,
    StrategyInstance,
    StrategySide,
} from "./types";

export class BacktestError extends Error {
    barIndex?: number;
    barTime?: number;

    constructor(message: string, barIndex?: number, barTime?: number) {
        super(message);
        this.name = "BacktestError";
        this.barIndex = barIndex;
        this.barTime = barTime;
    }
}

interface OpenPosition {
    id: string;
    side: StrategySide;
    quantity: number;
    entryTime: number;
    entryPrice: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    entryCommission: number;
    entrySlippage: number;
    entrySimIndex: number;
    tag?: string;
}

interface ValidatedAction {
    action: StrategyAction;
}

interface ActionRejection {
    reason: string;
}

type ActionResult = ValidatedAction | ActionRejection;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reject(reason: string): ActionRejection {
    return { reason };
}

function optionalFinite(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
    return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

function validateEnter(raw: Record<string, unknown>): ActionResult {
    if (raw.side !== "long" && raw.side !== "short") {
        return reject("invalid_side");
    }

    const quantity = raw.quantity ?? 1;
    if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_CONTRACTS_PER_ENTRY
    ) {
        return reject("invalid_quantity");
    }

    const stopPoints = optionalFinite(raw.stopLossPoints);
    const targetPoints = optionalFinite(raw.takeProfitPoints);
    const stopPrice = optionalFinite(raw.stopLossPrice);
    const targetPrice = optionalFinite(raw.takeProfitPrice);

    if (
        (raw.stopLossPoints !== undefined && stopPoints === undefined) ||
        (raw.takeProfitPoints !== undefined && targetPoints === undefined) ||
        (raw.stopLossPrice !== undefined && stopPrice === undefined) ||
        (raw.takeProfitPrice !== undefined && targetPrice === undefined)
    ) {
        return reject("invalid_bracket");
    }

    if (
        (stopPoints !== undefined && stopPrice !== undefined) ||
        (targetPoints !== undefined && targetPrice !== undefined)
    ) {
        return reject("conflicting_bracket");
    }

    if (
        (stopPoints !== undefined && stopPoints <= 0) ||
        (targetPoints !== undefined && targetPoints <= 0)
    ) {
        return reject("invalid_bracket");
    }

    return {
        action: {
            type: "enter",
            side: raw.side,
            quantity,
            ...(stopPoints === undefined ? {} : { stopLossPoints: stopPoints }),
            ...(targetPoints === undefined ? {} : { takeProfitPoints: targetPoints }),
            ...(stopPrice === undefined ? {} : { stopLossPrice: stopPrice }),
            ...(targetPrice === undefined ? {} : { takeProfitPrice: targetPrice }),
            ...(optionalString(raw.tag, 64) === undefined
                ? {}
                : { tag: optionalString(raw.tag, 64) }),
        },
    };
}

type LevelField =
    | { provided: false; value?: undefined; valid: true }
    | { provided: true; value: number | null; valid: boolean };

function levelField(raw: Record<string, unknown>, key: string): LevelField {
    if (!(key in raw)) return { provided: false, valid: true };

    const value = raw[key];

    if (value === null) return { provided: true, value: null, valid: true };

    if (typeof value === "number" && Number.isFinite(value)) {
        return { provided: true, value, valid: true };
    }

    return { provided: true, value: null, valid: false };
}

function validateModify(raw: Record<string, unknown>): ActionResult {
    if (typeof raw.positionId !== "string" || raw.positionId === "") {
        return reject("invalid_position_id");
    }

    const stopPoints = levelField(raw, "stopLossPoints");
    const stopPrice = levelField(raw, "stopLossPrice");
    const targetPoints = levelField(raw, "takeProfitPoints");
    const targetPrice = levelField(raw, "takeProfitPrice");

    if (
        !stopPoints.valid ||
        !stopPrice.valid ||
        !targetPoints.valid ||
        !targetPrice.valid
    ) {
        return reject("invalid_bracket");
    }

    if (
        (stopPoints.provided && stopPrice.provided) ||
        (targetPoints.provided && targetPrice.provided)
    ) {
        return reject("conflicting_bracket");
    }

    if (
        !stopPoints.provided &&
        !stopPrice.provided &&
        !targetPoints.provided &&
        !targetPrice.provided
    ) {
        return reject("empty_modify");
    }

    const action: ModifyAction = {
        type: "modify",
        positionId: raw.positionId,
    };

    if (stopPoints.provided) action.stopLossPoints = stopPoints.value;
    if (stopPrice.provided) action.stopLossPrice = stopPrice.value;
    if (targetPoints.provided) action.takeProfitPoints = targetPoints.value;
    if (targetPrice.provided) action.takeProfitPrice = targetPrice.value;

    return { action };
}

function validateAction(raw: unknown): ActionResult {
    if (!isRecord(raw)) return reject("malformed_action");

    if (raw.type === "enter") return validateEnter(raw);

    if (raw.type === "modify") return validateModify(raw);

    if (raw.type === "exit") {
        if (typeof raw.positionId !== "string" || raw.positionId === "") {
            return reject("invalid_position_id");
        }

        return {
            action: {
                type: "exit",
                positionId: raw.positionId,
                ...(optionalString(raw.reason, 128) === undefined
                    ? {}
                    : { reason: optionalString(raw.reason, 128) }),
            },
        };
    }

    if (raw.type === "exitAll") {
        return {
            action: {
                type: "exitAll",
                ...(optionalString(raw.reason, 128) === undefined
                    ? {}
                    : { reason: optionalString(raw.reason, 128) }),
            },
        };
    }

    return reject("unknown_action_type");
}

function increment(counts: Record<string, number>, key: string): void {
    counts[key] = (counts[key] ?? 0) + 1;
}

function freezeBar(bar: BacktestBar): BacktestBar {
    return Object.isFrozen(bar) ? bar : Object.freeze({ ...bar });
}

function positionView(position: OpenPosition): OpenPositionView {
    return Object.freeze({
        id: position.id,
        side: position.side,
        quantity: position.quantity,
        entryTime: position.entryTime,
        entryPrice: position.entryPrice,
        ...(position.stopLossPrice === undefined
            ? {}
            : { stopLossPrice: position.stopLossPrice }),
        ...(position.takeProfitPrice === undefined
            ? {}
            : { takeProfitPrice: position.takeProfitPrice }),
    });
}

function makeHistory(
    bars: BacktestBar[],
    index: number,
    maxLookbackBars: number,
): HistoryApi {
    const accessibleLength = Math.min(index + 1, maxLookbackBars);

    return {
        length: accessibleLength,
        at(offset: number): BacktestBar | null {
            if (!Number.isInteger(offset) || offset > 0) return null;

            const target = index + offset;
            const firstAccessible = index - accessibleLength + 1;

            if (target < 0 || target < firstAccessible) return null;

            return freezeBar(bars[target]);
        },
        last(count: number): BacktestBar[] {
            if (!Number.isFinite(count) || count <= 0) return [];

            const length = Math.min(
                Math.floor(count),
                maxLookbackBars,
                index + 1,
            );

            return bars.slice(index - length + 1, index + 1).map(freezeBar);
        },
    };
}

function timeContext(bar: BacktestBar) {
    const date = new Date(bar.time * 1000);

    return {
        utcYear: date.getUTCFullYear(),
        utcMonth: date.getUTCMonth() + 1,
        utcDay: date.getUTCDate(),
        utcHour: date.getUTCHours(),
        utcMinute: date.getUTCMinutes(),
        utcDayOfWeek: date.getUTCDay(),
    };
}

export interface RunBacktestInput {
    bars: BacktestBar[];
    config: BacktestRunConfig;
    strategy: StrategyInstance;
    onProgress?: (processed: number, total: number) => void;
}

export function runBacktest({
    bars,
    config,
    strategy,
    onProgress,
}: RunBacktestInput): BacktestResult {
    const firstInRangeIndex = bars.findIndex(
        (bar) => bar.time >= config.startTs,
    );
    const lastInRangeIndex = (() => {
        for (let index = bars.length - 1; index >= 0; index -= 1) {
            if (bars[index].time < config.endTsExclusive) return index;
        }
        return -1;
    })();

    if (firstInRangeIndex < 0 || lastInRangeIndex < firstInRangeIndex) {
        throw new BacktestError("No bars exist in the selected date range.");
    }

    const pointValue = config.instrument.pointValue;
    const commissionPerSide = config.instrument.commissionPerSide;
    const slippage = config.slippagePointsPerSide;

    if (!Number.isFinite(pointValue) || pointValue <= 0) {
        throw new BacktestError(
            "Instrument pointValue must be finite and greater than zero.",
        );
    }

    if (!Number.isFinite(commissionPerSide) || commissionPerSide < 0) {
        throw new BacktestError(
            "Instrument commissionPerSide must be finite and non-negative.",
        );
    }

    if (
        !Number.isFinite(config.startingCapital) ||
        config.startingCapital <= 0
    ) {
        throw new BacktestError(
            "Starting capital must be finite and greater than zero.",
        );
    }

    if (!Number.isFinite(slippage) || slippage < 0) {
        throw new BacktestError(
            "Slippage must be finite and non-negative.",
        );
    }

    if (
        !Number.isFinite(config.startTs) ||
        !Number.isFinite(config.endTsExclusive) ||
        config.endTsExclusive <= config.startTs
    ) {
        throw new BacktestError("Invalid UTC date range.");
    }

    const warmupBars = Number.isFinite(config.warmupBars)
        ? Math.max(0, Math.floor(config.warmupBars))
        : 0;
    const maxLookbackBars = Number.isFinite(config.maxLookbackBars)
        ? Math.max(1, Math.floor(config.maxLookbackBars))
        : 500;
    const maxOpenPositions = Number.isFinite(config.maxOpenPositions)
        ? Math.max(1, Math.floor(config.maxOpenPositions))
        : 1;
    const availableWarmupBars = firstInRangeIndex;
    const actualWarmupBars = Math.min(warmupBars, availableWarmupBars);

    const warmupStartIndex = Math.max(
        0,
        firstInRangeIndex - actualWarmupBars,
    );
    const totalCalls = lastInRangeIndex - warmupStartIndex + 1;
    const lastBar = bars[lastInRangeIndex];

    const openPositions: OpenPosition[] = [];
    const trades: ClosedTrade[] = [];
    const rejectedActions: Record<string, number> = {};
    const dailyEquity = new Map<string, EquityPoint>();

    let queuedActions: StrategyAction[] = [];
    let realizedNetPnl = 0;
    let tradeCounter = 0;
    let positionCounter = 0;
    let pendingActionsAtEnd = 0;
    let peakEquity = config.startingCapital;
    let maxDrawdown = 0;
    let maxDrawdownPct: number | null = 0;
    let lastEquity = config.startingCapital;
    let lastProgressAt = Date.now();

    const instrument = Object.freeze({ ...config.instrument });
    const params = Object.freeze({ ...config.parameters });

    function equityAt(close: number): {
        equity: number;
        unrealized: number;
    } {
        let unrealized = 0;
        let openEntryCommission = 0;

        for (const position of openPositions) {
            unrealized +=
                position.side === "long"
                    ? (close - position.entryPrice) * pointValue * position.quantity
                    : (position.entryPrice - close) * pointValue * position.quantity;
            openEntryCommission += position.entryCommission;
        }

        return {
            equity:
                config.startingCapital +
                realizedNetPnl +
                unrealized -
                openEntryCommission,
            unrealized,
        };
    }

    function accountContext(close: number): AccountContext {
        const { equity, unrealized } = equityAt(close);
        const drawdown = Math.max(0, peakEquity - equity);

        return {
            startingCapital: config.startingCapital,
            realizedNetPnl,
            unrealizedPnlAtClose: unrealized,
            equityAtClose: equity,
            closedTrades: trades.length,
            currentDrawdown: drawdown,
            currentDrawdownPct:
                peakEquity > 0 ? (drawdown / peakEquity) * 100 : null,
        };
    }

    function recordEquity(bar: BacktestBar): void {
        const { equity, unrealized } = equityAt(bar.close);

        if (equity > peakEquity) peakEquity = equity;

        const drawdown = Math.max(0, peakEquity - equity);
        const drawdownPct =
            peakEquity > 0 ? (drawdown / peakEquity) * 100 : null;

        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        if (drawdownPct !== null) {
            maxDrawdownPct =
                maxDrawdownPct === null
                    ? drawdownPct
                    : Math.max(maxDrawdownPct, drawdownPct);
        }

        lastEquity = equity;

        dailyEquity.set(formatUtcDate(bar.time), {
            time: bar.time,
            timeISO: formatUtcDateTime(bar.time),
            equity,
            realizedNetPnl,
            unrealizedPnlAtClose: unrealized,
            drawdown,
            drawdownPct,
        });
    }

    function closePosition(
        position: OpenPosition,
        exitPrice: number,
        referencePrice: number,
        reason: ExitReason,
        note: string | undefined,
        simIndex: number,
        exitBar: BacktestBar,
    ): void {
        const grossPnl =
            position.side === "long"
                ? (exitPrice - position.entryPrice) *
                  pointValue *
                  position.quantity
                : (position.entryPrice - exitPrice) *
                  pointValue *
                  position.quantity;
        const commissionCost = commissionPerSide * 2 * position.quantity;
        const exitSlippage =
            Math.abs(exitPrice - referencePrice) * pointValue * position.quantity;

        tradeCounter += 1;
        trades.push({
            id: `trade-${String(tradeCounter).padStart(6, "0")}`,
            side: position.side,
            quantity: position.quantity,
            entryTime: position.entryTime,
            entryTimeISO: formatUtcDateTime(position.entryTime),
            entryPrice: position.entryPrice,
            exitTime: exitBar.time,
            exitTimeISO: formatUtcDateTime(exitBar.time),
            exitPrice,
            exitReason: reason,
            ...(note === undefined ? {} : { exitNote: note }),
            ...(position.stopLossPrice === undefined
                ? {}
                : { stopLossPrice: position.stopLossPrice }),
            ...(position.takeProfitPrice === undefined
                ? {}
                : { takeProfitPrice: position.takeProfitPrice }),
            barsHeld: Math.max(0, simIndex - position.entrySimIndex),
            ...(position.tag === undefined ? {} : { tag: position.tag }),
            grossPnl,
            commissionCost,
            slippageCostEstimate: position.entrySlippage + exitSlippage,
            netPnl: grossPnl - commissionCost,
        });

        realizedNetPnl += grossPnl - commissionCost;

        const index = openPositions.indexOf(position);
        if (index >= 0) openPositions.splice(index, 1);
    }

    function processExit(
        action: ExitAction,
        bar: BacktestBar,
        simIndex: number,
    ): void {
        const position = openPositions.find(
            (candidate) => candidate.id === action.positionId,
        );

        if (!position) {
            increment(rejectedActions, "unknown_position");
            return;
        }

        const reference = bar.open;
        const fill =
            position.side === "long"
                ? reference - slippage
                : reference + slippage;

        closePosition(
            position,
            fill,
            reference,
            "strategy_exit",
            action.reason,
            simIndex,
            bar,
        );
    }

    function processExitAll(
        action: ExitAllAction,
        bar: BacktestBar,
        simIndex: number,
    ): void {
        for (const position of [...openPositions]) {
            const reference = bar.open;
            const fill =
                position.side === "long"
                    ? reference - slippage
                    : reference + slippage;

            closePosition(
                position,
                fill,
                reference,
                "exit_all",
                action.reason,
                simIndex,
                bar,
            );
        }
    }

    function bracketLevels(
        action: EnterAction,
        fill: number,
    ): { stopLossPrice?: number; takeProfitPrice?: number } | null {
        const long = action.side === "long";
        const stopFromPoints =
            action.stopLossPoints === undefined
                ? undefined
                : long
                  ? fill - action.stopLossPoints
                  : fill + action.stopLossPoints;
        const targetFromPoints =
            action.takeProfitPoints === undefined
                ? undefined
                : long
                  ? fill + action.takeProfitPoints
                  : fill - action.takeProfitPoints;

        const stopLossPrice = action.stopLossPrice ?? stopFromPoints;
        const takeProfitPrice = action.takeProfitPrice ?? targetFromPoints;

        if (
            (stopLossPrice !== undefined && !Number.isFinite(stopLossPrice)) ||
            (takeProfitPrice !== undefined && !Number.isFinite(takeProfitPrice))
        ) {
            return null;
        }

        if (
            stopLossPrice !== undefined &&
            (long ? stopLossPrice >= fill : stopLossPrice <= fill)
        ) {
            return null;
        }

        if (
            takeProfitPrice !== undefined &&
            (long ? takeProfitPrice <= fill : takeProfitPrice >= fill)
        ) {
            return null;
        }

        return {
            ...(stopLossPrice === undefined ? {} : { stopLossPrice }),
            ...(takeProfitPrice === undefined ? {} : { takeProfitPrice }),
        };
    }

    function modifyLevel(
        position: OpenPosition,
        kind: "stop" | "target",
        points: number | null | undefined,
        price: number | null | undefined,
    ): number | null | undefined {
        if (points === null || price === null) return null;
        if (points === undefined) return price;

        const sign =
            (position.side === "long") === (kind === "target") ? 1 : -1;

        return position.entryPrice + sign * points;
    }

    function processModify(action: ModifyAction): void {
        const position = openPositions.find(
            (candidate) => candidate.id === action.positionId,
        );

        if (!position) {
            increment(rejectedActions, "unknown_position");
            return;
        }

        const stopLoss = modifyLevel(
            position,
            "stop",
            action.stopLossPoints,
            action.stopLossPrice,
        );
        const takeProfit = modifyLevel(
            position,
            "target",
            action.takeProfitPoints,
            action.takeProfitPrice,
        );

        if (stopLoss !== undefined) {
            if (stopLoss === null) delete position.stopLossPrice;
            else position.stopLossPrice = stopLoss;
        }

        if (takeProfit !== undefined) {
            if (takeProfit === null) delete position.takeProfitPrice;
            else position.takeProfitPrice = takeProfit;
        }
    }

    function processEntry(
        action: EnterAction,
        bar: BacktestBar,
        simIndex: number,
    ): void {
        if (openPositions.length >= maxOpenPositions) {
            increment(rejectedActions, "max_open_positions");
            return;
        }

        const reference = bar.open;
        const fill =
            action.side === "long"
                ? reference + slippage
                : reference - slippage;
        const levels = bracketLevels(action, fill);

        if (levels === null) {
            increment(rejectedActions, "invalid_bracket");
            return;
        }

        const quantity = action.quantity ?? 1;
        positionCounter += 1;

        openPositions.push({
            id: `position-${String(positionCounter).padStart(6, "0")}`,
            side: action.side,
            quantity,
            entryTime: bar.time,
            entryPrice: fill,
            ...levels,
            entryCommission: commissionPerSide * quantity,
            entrySlippage: Math.abs(fill - reference) * pointValue * quantity,
            entrySimIndex: simIndex,
            ...(action.tag === undefined ? {} : { tag: action.tag }),
        });
    }

    function processQueuedActions(bar: BacktestBar, simIndex: number): void {
        if (queuedActions.length === 0) return;

        const actions = queuedActions;
        queuedActions = [];

        // Stable partition: modifiers first, then exits, then entries;
        // preserve order within each group.
        const modifies = actions.filter(
            (action): action is ModifyAction => action.type === "modify",
        );
        const exits = actions.filter(
            (action) => action.type === "exit" || action.type === "exitAll",
        );
        const entries = actions.filter(
            (action): action is EnterAction => action.type === "enter",
        );

        for (const action of modifies) {
            processModify(action);
        }

        for (const action of exits) {
            if (action.type === "exit") processExit(action, bar, simIndex);
            else processExitAll(action, bar, simIndex);
        }

        for (const action of entries) {
            processEntry(action, bar, simIndex);
        }
    }

    function checkBrackets(bar: BacktestBar, simIndex: number): void {
        for (const position of [...openPositions]) {
            const long = position.side === "long";
            const stop = position.stopLossPrice;
            const target = position.takeProfitPrice;

            const stopHit =
                stop !== undefined &&
                (long ? bar.low <= stop : bar.high >= stop);
            const targetHit =
                target !== undefined &&
                (long ? bar.high >= target : bar.low <= target);

            if (stopHit && stop !== undefined) {
                const reference =
                    long
                        ? bar.open <= stop
                            ? bar.open
                            : stop
                        : bar.open >= stop
                          ? bar.open
                          : stop;
                const fill =
                    long ? reference - slippage : reference + slippage;

                closePosition(
                    position,
                    fill,
                    reference,
                    "stop_loss",
                    undefined,
                    simIndex,
                    bar,
                );
                continue;
            }

            if (targetHit && target !== undefined) {
                closePosition(
                    position,
                    target,
                    target,
                    "take_profit",
                    undefined,
                    simIndex,
                    bar,
                );
            }
        }
    }

    function queueOrCountActions(
        result: StrategyAction | StrategyAction[] | null | undefined,
        isWarmup: boolean,
        isFinalBar: boolean,
        bar: BacktestBar,
        simIndex: number,
    ): void {
        if (typeof (result as { then?: unknown } | null)?.then === "function") {
            throw new BacktestError(
                `Strategy onBar returned a Promise at ${bar.timeISO}. onBar must be synchronous.`,
                simIndex,
                bar.time,
            );
        }

        if (isWarmup) return;

        if (result === null || result === undefined) return;

        const returned = Array.isArray(result) ? result : [result];

        if (returned.length > MAX_ACTIONS_PER_BAR) {
            rejectedActions.too_many_actions =
                (rejectedActions.too_many_actions ?? 0) +
                (returned.length - MAX_ACTIONS_PER_BAR);
        }

        const actions = returned.slice(0, MAX_ACTIONS_PER_BAR);

        for (const raw of actions) {
            const validated = validateAction(raw);

            if ("reason" in validated) {
                increment(rejectedActions, validated.reason);
                continue;
            }

            if (isFinalBar) {
                pendingActionsAtEnd += 1;
            } else {
                queuedActions.push(validated.action);
            }
        }
    }

    // Initial equity point: starting capital just before the selected range.
    const initialEquityPoint: EquityPoint = {
        time: config.startTs - 1,
        timeISO: formatUtcDateTime(config.startTs - 1),
        equity: config.startingCapital,
        realizedNetPnl: 0,
        unrealizedPnlAtClose: 0,
        drawdown: 0,
        drawdownPct: 0,
    };

    for (let index = warmupStartIndex; index <= lastInRangeIndex; index += 1) {
        const bar = bars[index];
        const simIndex = index - warmupStartIndex;
        const isWarmup = index < firstInRangeIndex;
        const isFinalBar = index === lastInRangeIndex;

        if (!isWarmup) {
            processQueuedActions(bar, simIndex);
        }

        checkBrackets(bar, simIndex);

        if (!isWarmup) {
            recordEquity(bar);
        }

        const account = isWarmup
            ? {
                  startingCapital: config.startingCapital,
                  realizedNetPnl,
                  unrealizedPnlAtClose: 0,
                  equityAtClose: config.startingCapital,
                  closedTrades: trades.length,
                  currentDrawdown: 0,
                  currentDrawdownPct: 0,
              }
            : accountContext(bar.close);

        const context: BarContext = {
            apiVersion: 1,
            index: simIndex,
            isWarmup,
            bar: freezeBar(bar),
            history: makeHistory(bars, index, maxLookbackBars),
            instrument,
            params,
            positions: openPositions.map(positionView),
            account,
            time: timeContext(bar),
        };

        let result: StrategyAction | StrategyAction[] | null | undefined;

        try {
            result = strategy.onBar(context);
        } catch (error) {
            throw new BacktestError(
                `Strategy onBar failed at ${bar.timeISO}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
                simIndex,
                bar.time,
            );
        }

        queueOrCountActions(result, isWarmup, isFinalBar, bar, simIndex);

        if (isFinalBar) {
            for (const position of [...openPositions]) {
                const reference = lastBar.close;
                const fill =
                    position.side === "long"
                        ? reference - slippage
                        : reference + slippage;

                closePosition(
                    position,
                    fill,
                    reference,
                    "end_of_test",
                    undefined,
                    simIndex,
                    lastBar,
                );
            }

            recordEquity(lastBar);
        }

        if (onProgress) {
            const now = Date.now();

            if (
                (simIndex + 1) % 1_000 === 0 ||
                isFinalBar ||
                now - lastProgressAt >= 250
            ) {
                lastProgressAt = now;
                onProgress(simIndex + 1, totalCalls);
            }
        }
    }

    const equityCurve = [
        initialEquityPoint,
        ...[...dailyEquity.values()].sort(
            (left, right) => left.time - right.time,
        ),
    ];
    const endingEquity =
        equityCurve.length > 0
            ? equityCurve[equityCurve.length - 1].equity
            : lastEquity;

    return {
        trades,
        summary: computeSummary(
            trades,
            config.startingCapital,
            endingEquity,
            maxDrawdown,
            maxDrawdownPct,
            rejectedActions,
            pendingActionsAtEnd,
        ),
        equityCurve,
        dataQuality: {
            baseBarsInRange: 0,
            baseBarsProcessed: 0,
            strategyBarsProcessed: totalCalls,
            inRangeStrategyBars: lastInRangeIndex - firstInRangeIndex + 1,
            warmup: {
                requestedBars: warmupBars,
                availableBars: availableWarmupBars,
                actualBars: actualWarmupBars,
                insufficient: actualWarmupBars < warmupBars,
            },
            warnings: [],
            hardErrors: [],
        },
        assumptions: {
            marketFill: "next bar open",
            bothStopAndTargetTouched: "stop first",
            stopGapFill:
                "bar open when worse than stop, otherwise stop level",
            takeProfitFill:
                "limit at target, no adverse slippage; no price improvement",
            forcedClose: "last bar close with adverse slippage",
            drawdown: "bar-close mark-to-market",
            positionSizing: "strategy-supplied quantity per entry (contracts)",
            openingGapPriority:
                "queued market entries/exits are processed before existing bracket checks at the same bar open",
        },
    };
}
