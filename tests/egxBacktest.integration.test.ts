import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { aggregatePackedBars } from "../src/backtesting/aggregateBars.ts";
import { analyzeDataQuality } from "../src/backtesting/dataQuality.ts";
import {
    packCandles,
    parseUtcDate,
    selectBaseRange,
} from "../src/backtesting/range.ts";
import { runBacktest } from "../src/backtesting/runBacktest.ts";
import type { BacktestRunConfig } from "../src/backtesting/types.ts";
import type { Candle } from "../src/types/candle.ts";
import { normaliseOhlc } from "../src/utils/normaliseOhlc.ts";

type RawStockBar = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

const SYMBOLS = ["COMI", "ETEL", "CCAP", "SWDY"];
const TIMEFRAMES = [1440, 10_080, 43_200];
const START_DATE = "2020-01-01";
const END_DATE = "2026-11-18";

function readStock(symbol: string): Candle[] | null {
    const fileName = `data/egx100/${symbol}-1d.json`;
    if (!fs.existsSync(fileName)) return null;

    const rows = JSON.parse(
        fs.readFileSync(fileName, "utf8"),
    ) as RawStockBar[];

    return rows.map((row) =>
        normaliseOhlc({
            ...row,
            time: row.time as Candle["time"],
            highHistory: [],
            lowHistory: [],
        }),
    );
}

const availableSymbols = SYMBOLS.filter(
    (symbol) => readStock(symbol) !== null,
);
const hasData = availableSymbols.length > 0;

function approx(actual: number, expected: number, message: string): void {
    assert.ok(
        Math.abs(actual - expected) < 1e-6,
        `${message}: expected ${expected}, got ${actual}`,
    );
}

test(
    "real EGX daily/weekly/monthly data runs through the full backtest pipeline",
    { skip: !hasData },
    () => {
        const startTs = parseUtcDate(START_DATE);
        const endTsExclusive = parseUtcDate(END_DATE) + 86_400;

        for (const symbol of availableSymbols) {
            const candles = readStock(symbol);
            assert.ok(candles);

            for (const timeframeMinutes of TIMEFRAMES) {
                const selection = selectBaseRange(
                    candles,
                    startTs,
                    endTsExclusive,
                    timeframeMinutes,
                    0,
                    500,
                );

                assert.equal(
                    selection.empty,
                    false,
                    `${symbol} ${timeframeMinutes}: no candles in range`,
                );

                const quality = analyzeDataQuality(
                    candles.slice(selection.from, selection.to),
                    startTs,
                    endTsExclusive,
                    timeframeMinutes,
                    { requestedBars: 0, availableBars: selection.availableWarmupBars },
                    1440,
                );

                assert.deepEqual(
                    quality.hardErrors,
                    [],
                    `${symbol} ${timeframeMinutes}: hard data errors`,
                );

                const packed = packCandles(
                    candles,
                    selection.from,
                    selection.to,
                );
                const aggregated = aggregatePackedBars(
                    packed,
                    timeframeMinutes,
                    selection.dropFirstAggregate,
                    1440,
                );

                assert.ok(
                    aggregated.bars.length > 0,
                    `${symbol} ${timeframeMinutes}: no aggregated bars`,
                );

                const config: BacktestRunConfig = {
                    instrument: {
                        id: symbol.toLowerCase(),
                        symbol,
                        assetClass: "stock",
                        currency: "EGP",
                        quantityUnit: "share",
                        baseTimeframeMinutes: 1440,
                        pointValue: 1,
                        commissionPerSide: 2,
                        commissionPercentPerSide: 0.1,
                    },
                    startDateUTC: START_DATE,
                    endDateUTC: END_DATE,
                    startTs,
                    endTsExclusive,
                    timeframeMinutes,
                    startingCapital: 100_000,
                    slippagePointsPerSide: 0.01,
                    maxOpenPositions: 1,
                    warmupBars: 0,
                    maxLookbackBars: 500,
                    parameters: {},
                };

                const result = runBacktest({
                    bars: aggregated.bars,
                    config,
                    strategy: {
                        onBar(context) {
                            if (context.index !== 0) return null;
                            return {
                                type: "enter",
                                side: "long",
                                quantity: 100,
                            };
                        },
                    },
                });

                assert.equal(
                    result.trades.length,
                    1,
                    `${symbol} ${timeframeMinutes}: expected one forced-close trade`,
                );

                const trade = result.trades[0];
                assert.equal(trade.quantity, 100);
                assert.equal(trade.exitReason, "end_of_test");
                approx(
                    trade.grossPnl,
                    (trade.exitPrice - trade.entryPrice) * 100,
                    `${symbol} ${timeframeMinutes}: stock gross P/L`,
                );
                approx(
                    trade.commissionCost,
                    2 +
                        trade.entryPrice * 100 * 0.001 +
                        2 +
                        trade.exitPrice * 100 * 0.001,
                    `${symbol} ${timeframeMinutes}: EGX round-trip commission`,
                );
                approx(
                    result.summary.endingEquity,
                    result.summary.startingEquity + result.summary.netPnl,
                    `${symbol} ${timeframeMinutes}: ending equity`,
                );

                const lastPoint = result.equityCurve.at(-1);
                assert.ok(lastPoint);
                approx(
                    lastPoint.equity,
                    result.summary.endingEquity,
                    `${symbol} ${timeframeMinutes}: final equity point`,
                );
            }
        }
    },
);
