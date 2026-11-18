import assert from "node:assert/strict";
import test from "node:test";

import {
    runPortfolioBacktest,
    type PortfolioBar,
    type PortfolioConfig,
    type PreparedSymbol,
} from "../src/backtesting/portfolio.ts";

function day(year: number, month: number, date: number): number {
    return Date.UTC(year, month - 1, date) / 1000;
}

function bar(
    symbol: string,
    time: number,
    open: number,
    high: number,
    low: number,
    close: number,
): PortfolioBar {
    return { symbol, time, open, high, low, close, volume: 1 };
}

function config(overrides: Partial<PortfolioConfig> = {}): PortfolioConfig {
    return {
        initialCapital: 10_000,
        monthlyTopUp: 0,
        maxOrderNotional: 500_000,
        riskPerTrade: 0.01,
        maxRiskPerTrade: 0.02,
        costPctPerSide: 0,
        fixedFeePerOrder: 0,
        idleCashMonthlyRate: 0,
        maxHoldBars: 20,
        stopMode: "percent",
        atrMultiplier: 2,
        fixedStopPct: 0.075,
        personalProfitPct: 0.1,
        personalProfitFixed: 0,
        ...overrides,
    };
}

function symbol(
    symbolName: string,
    bars: PortfolioBar[],
    entryIndexes: number[] = [],
    exitIndexes: number[] = [],
): PreparedSymbol {
    const entry = new Array<boolean>(bars.length).fill(false);
    const exit = new Array<boolean>(bars.length).fill(false);
    for (const index of entryIndexes) entry[index] = true;
    for (const index of exitIndexes) exit[index] = true;

    return {
        symbol: symbolName,
        bars,
        entry,
        exit,
        atr: new Array<number>(bars.length).fill(Number.NaN),
    };
}

test("monthly top-ups add cash at the first session of each new month", () => {
    const bars = [
        bar("TEST", day(2024, 1, 3), 100, 101, 99, 100),
        bar("TEST", day(2024, 1, 10), 100, 101, 99, 100),
        bar("TEST", day(2024, 2, 1), 100, 101, 99, 100),
        bar("TEST", day(2024, 3, 3), 100, 101, 99, 100),
    ];

    const result = runPortfolioBacktest(
        [symbol("TEST", bars)],
        config({ monthlyTopUp: 7_000 }),
    );

    assert.deepEqual(
        result.equityCurve.map((point) => point.deposit),
        [0, 0, 7_000, 7_000],
    );
    assert.equal(result.metrics.totalContributions, 24_000);
    assert.equal(result.metrics.trades, 0);
    assert.equal(result.metrics.finalEquity, 24_000);
});

test("monthly top-ups catch up across a month with no sessions", () => {
    const bars = [
        bar("TEST", day(2024, 1, 3), 100, 101, 99, 100),
        // February has no session in this fixture.
        bar("TEST", day(2024, 3, 3), 100, 101, 99, 100),
    ];

    const result = runPortfolioBacktest(
        [symbol("TEST", bars)],
        config({ monthlyTopUp: 7_000 }),
    );

    assert.deepEqual(
        result.equityCurve.map((point) => point.deposit),
        [0, 14_000],
    );
    assert.equal(result.metrics.totalContributions, 24_000);
});

test("idle cash earns monthly interest and compounds", () => {
    const bars = [
        bar("TEST", day(2024, 1, 3), 100, 101, 99, 100),
        bar("TEST", day(2024, 2, 1), 100, 101, 99, 100),
        bar("TEST", day(2024, 3, 1), 100, 101, 99, 100),
    ];

    const result = runPortfolioBacktest(
        [symbol("TEST", bars)],
        config({ idleCashMonthlyRate: 0.01 }),
    );

    assert.deepEqual(
        result.equityCurve.map((point) => point.interest),
        [0, 100, 101],
    );
    assert.equal(result.metrics.idleCashInterest, 201);
    assert.equal(result.metrics.finalEquity, 10_201);
});

test("wins move a fixed share to personal cash", () => {
    const bars = [
        bar("TEST", day(2024, 1, 2), 100, 101, 99, 100),
        bar("TEST", day(2024, 1, 3), 100, 115, 99, 110),
        bar("TEST", day(2024, 1, 4), 110, 112, 109, 111),
        bar("TEST", day(2024, 1, 5), 111, 112, 110, 111),
    ];

    const result = runPortfolioBacktest(
        [symbol("TEST", bars, [0], [1])],
        config(),
    );

    const trade = result.trades[0];
    assert.equal(trade.quantity, 13);
    assert.equal(trade.netPnl, 130);
    assert.equal(trade.personalWithdrawal, 13);
    assert.equal(result.metrics.personalWithdrawals, 13);
    assert.equal(result.metrics.finalEquity, 10_117);
});

test("account risk is capped at maxRiskPerTrade", () => {
    const bars = [
        bar("TEST", day(2024, 1, 2), 100, 101, 99, 100),
        bar("TEST", day(2024, 1, 3), 100, 101, 99, 100),
        bar("TEST", day(2024, 1, 4), 100, 101, 99, 100),
    ];

    const result = runPortfolioBacktest(
        [symbol("TEST", bars, [0])],
        config({ riskPerTrade: 0.05, maxRiskPerTrade: 0.02 }),
    );

    // 2% of 10k = 200 risk budget; 200 / (100 * 7.5%) = 26 shares.
    assert.equal(result.trades[0].quantity, 26);
});

test("max order notional caps quantity independently of risk size", () => {
    const bars = [
        bar("TEST", day(2024, 1, 2), 100, 101, 99, 100),
        bar("TEST", day(2024, 1, 3), 100, 115, 99, 110),
        bar("TEST", day(2024, 1, 4), 110, 112, 109, 111),
    ];

    const result = runPortfolioBacktest(
        [symbol("TEST", bars, [0], [1])],
        config({ maxOrderNotional: 500 }),
    );

    assert.equal(result.trades[0].quantity, 5);
});

test("concurrent positions across EGX30 symbols share the same cash", () => {
    const dates = [
        day(2024, 1, 2),
        day(2024, 1, 3),
        day(2024, 1, 4),
    ];
    const bars = (symbolName: string) => [
        bar(symbolName, dates[0], 100, 101, 99, 100),
        bar(symbolName, dates[1], 100, 101, 99, 100),
        bar(symbolName, dates[2], 100, 101, 99, 100),
    ];

    const result = runPortfolioBacktest(
        [
            symbol("AAA", bars("AAA"), [0]),
            symbol("BBB", bars("BBB"), [0]),
        ],
        config(),
    );

    assert.equal(result.trades.length, 2);
    assert.deepEqual(
        result.trades.map((trade) => trade.symbol).sort(),
        ["AAA", "BBB"],
    );
});
