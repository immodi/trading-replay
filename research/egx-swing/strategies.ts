import type { PortfolioBar } from "../../src/backtesting/portfolio.ts";
import { CONFIG } from "./config.ts";
import type { IndicatorSet } from "./indicators.ts";

export type StrategyFamily = "trend" | "range";

export type StrategySpec = {
    key: string;
    label: string;
    family: StrategyFamily;
    entry: boolean[];
    exit: boolean[];
};

function signals(
    bars: PortfolioBar[],
    test: (index: number) => boolean,
): boolean[] {
    const output = new Array<boolean>(bars.length).fill(false);
    for (let index = 0; index < bars.length; index += 1) {
        output[index] = test(index);
    }
    return output;
}

export function buildStrategies(
    bars: PortfolioBar[],
    ind: IndicatorSet,
): StrategySpec[] {
    const close = bars.map((bar) => bar.close);
    const specs: StrategySpec[] = [];

    specs.push({
        key: "t1_donchian",
        label: "T1 Donchian breakout",
        family: "trend",
        entry: signals(
            bars,
            (index) =>
                Number.isFinite(ind.donchianHigh20[index]) &&
                close[index] >= ind.donchianHigh20[index],
        ),
        exit: signals(
            bars,
            (index) =>
                Number.isFinite(ind.donchianLow10[index]) &&
                close[index] < ind.donchianLow10[index],
        ),
    });

    specs.push({
        key: "t2_pullback",
        label: "T2 Uptrend pullback",
        family: "trend",
        entry: signals(
            bars,
            (index) =>
                index > 0 &&
                Number.isFinite(ind.sma50[index]) &&
                Number.isFinite(ind.sma50[index - 1]) &&
                Number.isFinite(ind.ema20[index]) &&
                Number.isFinite(ind.ema20[index - 1]) &&
                close[index] > ind.sma50[index] &&
                ind.sma50[index] > ind.sma50[index - 1] &&
                close[index - 1] < ind.ema20[index - 1] &&
                close[index] > ind.ema20[index],
        ),
        exit: signals(
            bars,
            (index) =>
                Number.isFinite(ind.sma50[index]) &&
                close[index] < ind.sma50[index],
        ),
    });

    specs.push({
        key: "t3_ema_cross",
        label: "T3 EMA 10/30 crossover",
        family: "trend",
        entry: signals(
            bars,
            (index) =>
                index > 0 &&
                Number.isFinite(ind.ema10[index]) &&
                Number.isFinite(ind.ema30[index]) &&
                Number.isFinite(ind.ema10[index - 1]) &&
                Number.isFinite(ind.ema30[index - 1]) &&
                ind.ema10[index - 1] <= ind.ema30[index - 1] &&
                ind.ema10[index] > ind.ema30[index],
        ),
        exit: signals(
            bars,
            (index) =>
                index > 0 &&
                Number.isFinite(ind.ema10[index]) &&
                Number.isFinite(ind.ema30[index]) &&
                Number.isFinite(ind.ema10[index - 1]) &&
                Number.isFinite(ind.ema30[index - 1]) &&
                ind.ema10[index - 1] >= ind.ema30[index - 1] &&
                ind.ema10[index] < ind.ema30[index],
        ),
    });

    specs.push({
        key: "r1_bollinger",
        label: "R1 Bollinger reversion",
        family: "range",
        entry: signals(
            bars,
            (index) =>
                Number.isFinite(ind.bollingerLower[index]) &&
                close[index] < ind.bollingerLower[index],
        ),
        exit: signals(
            bars,
            (index) =>
                Number.isFinite(ind.bollingerMid[index]) &&
                close[index] >= ind.bollingerMid[index],
        ),
    });

    specs.push({
        key: "r2_rsi14",
        label: "R2 RSI(14) oversold",
        family: "range",
        entry: signals(
            bars,
            (index) =>
                Number.isFinite(ind.rsi14[index]) &&
                ind.rsi14[index] < CONFIG.rsiEntry,
        ),
        exit: signals(
            bars,
            (index) =>
                Number.isFinite(ind.rsi14[index]) &&
                ind.rsi14[index] > CONFIG.rsiExit,
        ),
    });

    specs.push({
        key: "r2_rsi2",
        label: "R2 RSI(2) oversold",
        family: "range",
        entry: signals(
            bars,
            (index) =>
                Number.isFinite(ind.rsi2[index]) &&
                ind.rsi2[index] < CONFIG.rsi2Entry,
        ),
        exit: signals(
            bars,
            (index) =>
                Number.isFinite(ind.rsi2[index]) &&
                ind.rsi2[index] > CONFIG.rsi2Exit,
        ),
    });

    specs.push({
        key: "r3_range_mid",
        label: "R3 Range channel → midpoint",
        family: "range",
        entry: signals(
            bars,
            (index) =>
                Number.isFinite(ind.rangePosition[index]) &&
                ind.rangePosition[index] <= CONFIG.rangeEntryPct,
        ),
        exit: signals(
            bars,
            (index) =>
                Number.isFinite(ind.rangeMid20[index]) &&
                close[index] >= ind.rangeMid20[index],
        ),
    });

    specs.push({
        key: "r3_range_top",
        label: "R3 Range channel → top",
        family: "range",
        entry: signals(
            bars,
            (index) =>
                Number.isFinite(ind.rangePosition[index]) &&
                ind.rangePosition[index] <= CONFIG.rangeEntryPct,
        ),
        exit: signals(
            bars,
            (index) =>
                Number.isFinite(ind.rangeHigh20[index]) &&
                close[index] >= ind.rangeHigh20[index],
        ),
    });

    return specs;
}

export function regimeGate(
    family: StrategyFamily,
    adx: number[],
): boolean[] {
    return adx.map((value) =>
        family === "trend"
            ? Number.isFinite(value) && value > CONFIG.adxTrendThreshold
            : Number.isFinite(value) && value < CONFIG.adxRangeThreshold,
    );
}
