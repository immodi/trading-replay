import assert from "node:assert/strict";
import test from "node:test";

import { buildBacktestExport } from "../src/backtesting/buildExport.ts";
import { MAX_CONTRACTS_PER_ENTRY } from "../src/backtesting/constants.ts";
import { runBacktest } from "../src/backtesting/runBacktest.ts";
import type { BacktestBar, BacktestRunConfig } from "../src/backtesting/types.ts";

const BASE = Date.UTC(2024, 0, 1) / 1000;

function barsFrom(values: Array<[number, number, number, number]>): BacktestBar[] {
    return values.map(([open, high, low, close], index) => ({
        time: BASE + index * 60,
        timeISO: new Date((BASE + index * 60) * 1000).toISOString(),
        open,
        high,
        low,
        close,
        volume: 10,
    }));
}

test("export includes strategy, settings, metrics, curve, and trades", () => {
    const bars = barsFrom([
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [110, 111, 109, 110],
    ]);
    const config: BacktestRunConfig = {
        instrument: {
            id: "test",
            symbol: "TEST",
            pointValue: 2,
            commissionPerSide: 1,
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
        parameters: { quantity: 2 },
    };
    const metadata = {
        apiVersion: 1 as const,
        id: "test-strategy",
        name: "Test Strategy",
        version: "1.0.0",
        warmupBars: 0,
        maxLookbackBars: 500,
        parameters: [],
    };

    const result = runBacktest({
        bars,
        config,
        strategy: {
            onBar(context) {
                if (context.index === 0) {
                    return { type: "enter", side: "long", quantity: 2 };
                }
                if (context.index === 1) {
                    return { type: "exit", positionId: context.positions[0].id };
                }
                return null;
            },
        },
    });

    const exported = buildBacktestExport({
        result,
        metadata,
        fileName: "test-strategy.js",
        source: "export const metadata = {};",
        parameters: { quantity: 2 },
        instrument: config.instrument,
        config,
    });

    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.application, "TradeReplay");
    assert.equal(exported.strategy.source, "export const metadata = {};");
    assert.equal(exported.settings.maxContractsPerEntry, MAX_CONTRACTS_PER_ENTRY);
    assert.equal(exported.settings.executionAssumptions.positionSizing.includes("strategy"), true);
    assert.equal(exported.trades[0].quantity, 2);
    assert.equal(exported.summary.closedTrades, 1);
    assert.equal(exported.equityCurve.length > 0, true);

    const roundTrip = JSON.parse(JSON.stringify(exported));
    assert.equal(roundTrip.trades[0].netPnl, 36);
});
