import assert from "node:assert/strict";
import test from "node:test";

import { MAX_CONTRACTS_PER_ENTRY } from "../src/backtesting/constants.ts";
import { runBacktest } from "../src/backtesting/runBacktest.ts";
import type {
    BacktestBar,
    BacktestRunConfig,
    BarContext,
    StrategyAction,
    StrategyInstance,
} from "../src/backtesting/types.ts";

const BASE = Date.UTC(2024, 0, 1) / 1000;

function barsFrom(
    values: Array<[number, number, number, number, number?]>,
): BacktestBar[] {
    return values.map(([open, high, low, close, volume = 1], index) => ({
        time: BASE + index * 60,
        timeISO: new Date((BASE + index * 60) * 1000).toISOString(),
        open,
        high,
        low,
        close,
        volume,
    }));
}

function config(overrides: Partial<BacktestRunConfig> = {}): BacktestRunConfig {
    return {
        instrument: {
            id: "test",
            symbol: "TEST",
            pointValue: 2,
            commissionPerSide: 0,
        },
        startDateUTC: "2024-01-01",
        endDateUTC: "2024-01-01",
        startTs: BASE,
        endTsExclusive: BASE + 86_400,
        timeframeMinutes: 1,
        startingCapital: 10_000,
        slippagePointsPerSide: 0,
        maxOpenPositions: 1,
        warmupBars: 0,
        maxLookbackBars: 500,
        parameters: {},
        ...overrides,
    };
}

function strategy(onBar: (context: BarContext) => StrategyAction | StrategyAction[] | null): StrategyInstance {
    return { onBar };
}

function approx(actual: number, expected: number, message?: string): void {
    assert.ok(
        Math.abs(actual - expected) < 1e-9,
        `${message ?? "value"} expected ${expected}, got ${actual}`,
    );
}

test("a signal fills at the next bar open, not the same close", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [101, 102, 100, 101],
        [102, 103, 101, 102],
    ]);

    const result = runBacktest({
        bars,
        config: config(),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return { type: "enter", side: "long", quantity: 1 };
            }

            if (context.index === 1 && context.positions.length > 0) {
                return {
                    type: "exit",
                    positionId: context.positions[0].id,
                };
            }

            return null;
        }),
    });

    assert.equal(result.trades.length, 1);
    assert.equal(result.trades[0].entryTime, bars[1].time);
    assert.equal(result.trades[0].entryPrice, 101);
    assert.equal(result.trades[0].exitTime, bars[2].time);
    assert.equal(result.trades[0].exitPrice, 102);
    assert.equal(result.trades[0].barsHeld, 1);
});

test("history exposes current/prior bars and never future bars", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [101, 102, 100, 101],
        [102, 103, 101, 102],
    ]);

    const result = runBacktest({
        bars,
        config: config(),
        strategy: strategy((context) => {
            if (context.index === 2) {
                assert.equal(context.history.at(0)?.time, bars[2].time);
                assert.equal(context.history.at(-1)?.time, bars[1].time);
                assert.equal(context.history.at(1), null);
                assert.equal(context.history.at(-500), null);
                assert.deepEqual(
                    context.history.last(2).map((bar) => bar.time),
                    [bars[1].time, bars[2].time],
                );
            }

            return null;
        }),
    });

    assert.equal(result.trades.length, 0);
});

test("slippage is adverse for long and short entries and exits", () => {
    const longBars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [110, 111, 109, 110],
    ]);

    const long = runBacktest({
        bars: longBars,
        config: config({ slippagePointsPerSide: 0.5 }),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return { type: "enter", side: "long", quantity: 1 };
            }
            if (context.index === 1) {
                return { type: "exit", positionId: context.positions[0].id };
            }
            return null;
        }),
    });

    approx(long.trades[0].entryPrice, 100.5);
    approx(long.trades[0].exitPrice, 109.5);
    approx(long.trades[0].grossPnl, 18);
    approx(long.trades[0].slippageCostEstimate, 2);

    const shortBars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [90, 91, 89, 90],
    ]);

    const short = runBacktest({
        bars: shortBars,
        config: config({ slippagePointsPerSide: 0.5 }),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return { type: "enter", side: "short", quantity: 1 };
            }
            if (context.index === 1) {
                return { type: "exit", positionId: context.positions[0].id };
            }
            return null;
        }),
    });

    approx(short.trades[0].entryPrice, 99.5);
    approx(short.trades[0].exitPrice, 90.5);
    approx(short.trades[0].grossPnl, 18);
    approx(short.trades[0].slippageCostEstimate, 2);
});

test("point value, quantity, and per-side commission are applied correctly", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [110, 111, 109, 110],
    ]);

    const result = runBacktest({
        bars,
        config: config({
            instrument: {
                id: "test",
                symbol: "TEST",
                pointValue: 2,
                commissionPerSide: 1.5,
            },
        }),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return { type: "enter", side: "long", quantity: 3 };
            }
            if (context.index === 1) {
                return { type: "exit", positionId: context.positions[0].id };
            }
            return null;
        }),
    });

    const trade = result.trades[0];
    assert.equal(trade.quantity, 3);
    approx(trade.grossPnl, 60);
    approx(trade.commissionCost, 9);
    approx(trade.netPnl, 51);
});

test("different entries in one run can use different quantities", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [110, 111, 109, 110],
        [110, 111, 109, 110],
        [120, 121, 119, 120],
    ]);

    const result = runBacktest({
        bars,
        config: config({ maxOpenPositions: 1 }),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return { type: "enter", side: "long", quantity: 1 };
            }
            if (context.index === 1) {
                return { type: "exit", positionId: context.positions[0].id };
            }
            if (context.index === 2) {
                return { type: "enter", side: "long", quantity: 4 };
            }
            if (context.index === 3) {
                return { type: "exit", positionId: context.positions[0].id };
            }
            return null;
        }),
    });

    assert.equal(result.trades.length, 2);
    assert.equal(result.trades[0].quantity, 1);
    assert.equal(result.trades[1].quantity, 4);
    approx(result.trades[0].grossPnl, 20);
    approx(result.trades[1].grossPnl, 80);
});

test("stop-loss, take-profit, unbracketed, and entry-candle behavior", () => {
    const bothBars = barsFrom([
        [100, 101, 99, 100],
        [100, 102, 99, 100],
        [100, 111, 94, 100],
    ]);

    const both = runBacktest({
        bars: bothBars,
        config: config(),
        strategy: strategy((context) =>
            context.index === 0
                ? {
                      type: "enter",
                      side: "long",
                      stopLossPoints: 5,
                      takeProfitPoints: 10,
                  }
                : null,
        ),
    });

    assert.equal(both.trades[0].exitReason, "stop_loss");
    approx(both.trades[0].exitPrice, 95);

    const targetBars = barsFrom([
        [100, 101, 99, 100],
        [100, 102, 99, 100],
        [100, 111, 99, 100],
    ]);

    const target = runBacktest({
        bars: targetBars,
        config: config({ slippagePointsPerSide: 1 }),
        strategy: strategy((context) =>
            context.index === 0
                ? {
                      type: "enter",
                      side: "long",
                      takeProfitPoints: 10,
                  }
                : null,
        ),
    });

    assert.equal(target.trades[0].exitReason, "take_profit");
    approx(target.trades[0].exitPrice, 111);

    const entryBarBars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 94, 100],
    ]);

    const entryBar = runBacktest({
        bars: entryBarBars,
        config: config(),
        strategy: strategy((context) =>
            context.index === 0
                ? { type: "enter", side: "long", stopLossPoints: 5 }
                : null,
        ),
    });

    assert.equal(entryBar.trades[0].exitReason, "stop_loss");
    assert.equal(entryBar.trades[0].barsHeld, 0);

    const unbracketedBars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [105, 106, 104, 105],
    ]);

    const unbracketed = runBacktest({
        bars: unbracketedBars,
        config: config(),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return { type: "enter", side: "long" };
            }
            if (context.index === 1) {
                return { type: "exit", positionId: context.positions[0].id };
            }
            return null;
        }),
    });

    assert.equal(unbracketed.trades[0].exitReason, "strategy_exit");
});

test("stop gaps use the bar open when it is worse than the stop", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [90, 92, 89, 91],
    ]);

    const result = runBacktest({
        bars,
        config: config(),
        strategy: strategy((context) =>
            context.index === 0
                ? { type: "enter", side: "long", stopLossPoints: 5 }
                : null,
        ),
    });

    assert.equal(result.trades[0].exitReason, "stop_loss");
    approx(result.trades[0].exitPrice, 90);
});

test("exit, exitAll, max-open rejection, malformed actions, and exit-first ordering", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 101, 99, 100],
    ]);

    const result = runBacktest({
        bars,
        config: config({ maxOpenPositions: 1 }),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return [
                    { type: "enter", side: "long", quantity: 1 },
                    { type: "enter", side: "long", quantity: 1 },
                    { type: "enter", side: "long", quantity: 0 },
                    { type: "exit", positionId: "missing" },
                ];
            }

            if (context.index === 1) {
                return { type: "exitAll", reason: "flat" };
            }

            return null;
        }),
    });

    assert.equal(result.trades.length, 1);
    assert.equal(result.trades[0].exitReason, "exit_all");
    assert.equal(result.trades[0].exitNote, "flat");
    assert.equal(result.summary.rejectedActions.max_open_positions, 1);
    assert.equal(result.summary.rejectedActions.invalid_quantity, 1);
    assert.equal(result.summary.rejectedActions.unknown_position, 1);
});

test("exits are processed before entries from the same callback", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 101, 99, 100],
    ]);

    let sawReplacement = false;

    runBacktest({
        bars,
        config: config({ maxOpenPositions: 1 }),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return { type: "enter", side: "long" };
            }

            if (context.index === 1) {
                return [
                    { type: "enter", side: "long" },
                    { type: "exitAll" },
                ];
            }

            if (context.index === 2) {
                sawReplacement = context.positions.length === 1;
            }

            return null;
        }),
    });

    assert.equal(sawReplacement, true);
});

test("wrong-side absolute brackets are rejected", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [105, 106, 104, 105],
    ]);

    const result = runBacktest({
        bars,
        config: config(),
        strategy: strategy((context) =>
            context.index === 0
                ? {
                      type: "enter",
                      side: "long",
                      stopLossPrice: 110,
                  }
                : null,
        ),
    });

    assert.equal(result.trades.length, 0);
    assert.equal(result.summary.rejectedActions.invalid_bracket, 1);
});

test("final-bar actions are pending and open positions close at the last close", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [110, 111, 109, 110],
    ]);

    const result = runBacktest({
        bars,
        config: config({ slippagePointsPerSide: 0.5 }),
        strategy: strategy((context) => {
            if (context.index === 0) {
                return { type: "enter", side: "long" };
            }

            if (context.index === 2) {
                return { type: "exit", positionId: context.positions[0].id };
            }

            return null;
        }),
    });

    assert.equal(result.trades.length, 1);
    assert.equal(result.trades[0].exitReason, "end_of_test");
    approx(result.trades[0].exitPrice, 109.5);
    assert.equal(result.summary.pendingActionsAtEnd, 1);
});

test("warm-up calls initialize state but cannot trade", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [105, 106, 104, 105],
    ]);

    const seen: Array<{ index: number; warmup: boolean }> = [];

    const result = runBacktest({
        bars,
        config: config({ startTs: bars[3].time, warmupBars: 2 }),
        strategy: strategy((context) => {
            seen.push({ index: context.index, warmup: context.isWarmup });

            if (context.isWarmup && context.index === 1) {
                return { type: "enter", side: "long" };
            }

            if (context.index === 2) {
                return { type: "enter", side: "long" };
            }

            return null;
        }),
    });

    assert.deepEqual(seen, [
        { index: 0, warmup: true },
        { index: 1, warmup: true },
        { index: 2, warmup: false },
        { index: 3, warmup: false },
    ]);
    assert.equal(result.trades.length, 1);
    assert.equal(result.trades[0].entryTime, bars[4].time);
});

test("inclusive UTC date filtering excludes bars outside the range", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 101, 99, 100],
    ]);

    const calls: number[] = [];

    runBacktest({
        bars,
        config: config({
            startTs: bars[1].time,
            endTsExclusive: bars[3].time,
        }),
        strategy: strategy((context) => {
            calls.push(context.index);
            return null;
        }),
    });

    assert.deepEqual(calls, [0, 1]);
});

test("results are deterministic for the same deterministic strategy", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [110, 111, 109, 110],
        [110, 111, 109, 110],
        [120, 121, 119, 120],
    ]);

    const makeStrategy = () =>
        strategy((context) => {
            if (context.index === 0 || context.index === 2) {
                return { type: "enter", side: "long", quantity: 2 };
            }
            if (context.index === 1 || context.index === 3) {
                return { type: "exit", positionId: context.positions[0].id };
            }
            return null;
        });

    const first = runBacktest({
        bars,
        config: config(),
        strategy: makeStrategy(),
    });
    const second = runBacktest({
        bars,
        config: config(),
        strategy: makeStrategy(),
    });

    assert.deepEqual(first.trades, second.trades);
    assert.deepEqual(first.summary, second.summary);
});

test("empty trade results do not contain NaN or Infinity", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
    ]);

    const result = runBacktest({
        bars,
        config: config(),
        strategy: strategy(() => null),
    });

    assert.equal(result.summary.closedTrades, 0);
    assert.equal(result.summary.winRatePct, null);
    assert.equal(result.summary.profitFactor, null);
    assert.equal(result.summary.expectancyPerTrade, null);

    const serialized = JSON.parse(JSON.stringify(result));
    assert.equal(serialized.summary.winRatePct, null);
    assert.equal(serialized.summary.profitFactor, null);
});

test("invalid and oversized contract quantities are rejected", () => {    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
    ]);

    const result = runBacktest({
        bars,
        config: config(),
        strategy: strategy((context) => {
            if (context.index !== 0) return null;

            return [
                { type: "enter", side: "long", quantity: 0 },
                { type: "enter", side: "long", quantity: 1.5 },
                { type: "enter", side: "long", quantity: MAX_CONTRACTS_PER_ENTRY + 1 },
            ];
        }),
    });

    assert.equal(result.trades.length, 0);
    assert.equal(result.summary.rejectedActions.invalid_quantity, 3);
});

test("a Promise-returning onBar fails the run, including during warm-up", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
    ]);

    assert.throws(
        () =>
            runBacktest({
                bars,
                config: config({ startTs: bars[1].time, warmupBars: 1 }),
                strategy: {
                    onBar: (() => Promise.resolve(null)) as unknown as StrategyInstance["onBar"],
                },
            }),
        /Promise/,
    );
});
