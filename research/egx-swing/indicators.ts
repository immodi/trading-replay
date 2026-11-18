import type { PortfolioBar } from "../../src/backtesting/portfolio.ts";
import { CONFIG } from "./config.ts";

export type IndicatorSet = {
    sma50: number[];
    ema20: number[];
    ema10: number[];
    ema30: number[];
    donchianHigh20: number[];
    donchianLow10: number[];
    bollingerMid: number[];
    bollingerUpper: number[];
    bollingerLower: number[];
    rsi14: number[];
    rsi2: number[];
    rangeHigh20: number[];
    rangeLow20: number[];
    rangeMid20: number[];
    rangePosition: number[];
    atr: number[];
    adx: number[];
};

function sma(values: number[], period: number): number[] {
    const output = new Array<number>(values.length).fill(Number.NaN);
    let sum = 0;

    for (let index = 0; index < values.length; index += 1) {
        sum += values[index];
        if (index >= period) sum -= values[index - period];
        if (index >= period - 1) output[index] = sum / period;
    }

    return output;
}

function ema(values: number[], period: number): number[] {
    const output = new Array<number>(values.length).fill(Number.NaN);
    if (values.length < period) return output;

    let seed = 0;
    for (let index = 0; index < period; index += 1) seed += values[index];
    output[period - 1] = seed / period;

    const alpha = 2 / (period + 1);
    for (let index = period; index < values.length; index += 1) {
        output[index] =
            alpha * values[index] + (1 - alpha) * output[index - 1];
    }

    return output;
}

function wilder(values: number[], period: number): number[] {
    const output = new Array<number>(values.length).fill(Number.NaN);
    let start = 0;

    while (start < values.length && !Number.isFinite(values[start])) {
        start += 1;
    }

    const seedEnd = start + period - 1;
    if (seedEnd >= values.length) return output;

    let seed = 0;
    for (let index = start; index <= seedEnd; index += 1) {
        if (!Number.isFinite(values[index])) return output;
        seed += values[index];
    }
    output[seedEnd] = seed / period;

    const alpha = 1 / period;
    for (let index = seedEnd + 1; index < values.length; index += 1) {
        if (!Number.isFinite(values[index])) continue;
        output[index] =
            alpha * values[index] + (1 - alpha) * output[index - 1];
    }

    return output;
}

function rsi(values: number[], period: number): number[] {
    const gains = new Array<number>(values.length).fill(0);
    const losses = new Array<number>(values.length).fill(0);

    for (let index = 1; index < values.length; index += 1) {
        const delta = values[index] - values[index - 1];
        gains[index] = Math.max(0, delta);
        losses[index] = Math.max(0, -delta);
    }

    const averageGain = wilder(gains, period);
    const averageLoss = wilder(losses, period);
    const output = new Array<number>(values.length).fill(Number.NaN);

    for (let index = 0; index < values.length; index += 1) {
        const gain = averageGain[index];
        const loss = averageLoss[index];

        if (!Number.isFinite(gain) || !Number.isFinite(loss)) continue;

        if (gain === 0 && loss === 0) {
            output[index] = 50;
        } else if (loss === 0) {
            output[index] = 100;
        } else if (gain === 0) {
            output[index] = 0;
        } else {
            const rs = gain / loss;
            output[index] = 100 - 100 / (1 + rs);
        }
    }

    return output;
}

function trueRange(bars: PortfolioBar[]): number[] {
    const output = new Array<number>(bars.length).fill(Number.NaN);

    for (let index = 0; index < bars.length; index += 1) {
        const bar = bars[index];
        const previousClose = index > 0 ? bars[index - 1].close : bar.close;
        output[index] = Math.max(
            bar.high - bar.low,
            Math.abs(bar.high - previousClose),
            Math.abs(bar.low - previousClose),
        );
    }

    return output;
}

function atr(bars: PortfolioBar[], period: number): number[] {
    return wilder(trueRange(bars), period);
}

function adx(bars: PortfolioBar[], period: number): number[] {
    const plusDm = new Array<number>(bars.length).fill(0);
    const minusDm = new Array<number>(bars.length).fill(0);

    for (let index = 1; index < bars.length; index += 1) {
        const upMove = bars[index].high - bars[index - 1].high;
        const downMove = bars[index - 1].low - bars[index].low;

        if (upMove > downMove && upMove > 0) plusDm[index] = upMove;
        if (downMove > upMove && downMove > 0) minusDm[index] = downMove;
    }

    const atrValues = atr(bars, period);
    const plusDi = wilder(plusDm, period).map(
        (value, index) =>
            atrValues[index] > 0
                ? (100 * value) / atrValues[index]
                : Number.NaN,
    );
    const minusDi = wilder(minusDm, period).map(
        (value, index) =>
            atrValues[index] > 0
                ? (100 * value) / atrValues[index]
                : Number.NaN,
    );
    const dx = plusDi.map((plus, index) => {
        const minus = minusDi[index];
        const denominator = plus + minus;
        return denominator > 0
            ? (100 * Math.abs(plus - minus)) / denominator
            : Number.NaN;
    });

    return wilder(dx, period);
}

function rolling(values: number[], period: number, mode: "max" | "min"): number[] {
    const output = new Array<number>(values.length).fill(Number.NaN);

    for (let index = period - 1; index < values.length; index += 1) {
        let best = values[index - period + 1];
        for (let offset = index - period + 2; offset <= index; offset += 1) {
            best =
                mode === "max"
                    ? Math.max(best, values[offset])
                    : Math.min(best, values[offset]);
        }
        output[index] = best;
    }

    return output;
}

function rollingStd(values: number[], period: number): number[] {
    const output = new Array<number>(values.length).fill(Number.NaN);

    for (let index = period - 1; index < values.length; index += 1) {
        let sum = 0;
        for (let offset = index - period + 1; offset <= index; offset += 1) {
            sum += values[offset];
        }
        const mean = sum / period;
        let variance = 0;
        for (let offset = index - period + 1; offset <= index; offset += 1) {
            variance += (values[offset] - mean) ** 2;
        }
        output[index] = Math.sqrt(variance / period);
    }

    return output;
}

export function buildIndicators(bars: PortfolioBar[]): IndicatorSet {
    const close = bars.map((bar) => bar.close);
    const high = bars.map((bar) => bar.high);
    const low = bars.map((bar) => bar.low);

    const donchianHigh20 = rolling(close, CONFIG.donchianEntry, "max");
    const donchianLow10 = rolling(close, CONFIG.donchianExit, "min");
    const rangeHigh20 = rolling(high, CONFIG.rangeLookback, "max");
    const rangeLow20 = rolling(low, CONFIG.rangeLookback, "min");
    const bollingerMid = sma(close, CONFIG.bollingerPeriod);
    const deviation = rollingStd(close, CONFIG.bollingerPeriod);
    const bollingerUpper = bollingerMid.map(
        (value, index) =>
            value + CONFIG.bollingerStd * deviation[index],
    );
    const bollingerLower = bollingerMid.map(
        (value, index) =>
            value - CONFIG.bollingerStd * deviation[index],
    );

    return {
        sma50: sma(close, CONFIG.trendSmaPeriod),
        ema20: ema(close, CONFIG.pullbackEmaPeriod),
        ema10: ema(close, CONFIG.emaFast),
        ema30: ema(close, CONFIG.emaSlow),
        donchianHigh20,
        donchianLow10,
        bollingerMid,
        bollingerUpper,
        bollingerLower,
        rsi14: rsi(close, CONFIG.rsiPeriod),
        rsi2: rsi(close, CONFIG.rsi2Period),
        rangeHigh20,
        rangeLow20,
        rangeMid20: rangeHigh20.map(
            (value, index) => (value + rangeLow20[index]) / 2,
        ),
        rangePosition: close.map((value, index) => {
            const width = rangeHigh20[index] - rangeLow20[index];
            return width > 0
                ? (value - rangeLow20[index]) / width
                : Number.NaN;
        }),
        atr: atr(bars, CONFIG.atrPeriod),
        adx: adx(bars, CONFIG.adxPeriod),
    };
}
