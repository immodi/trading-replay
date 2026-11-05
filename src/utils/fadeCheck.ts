import type { PriceData } from "@/types/priceData";

export type FadeSide = "long" | "short";
export type FadeTrend = "bullish" | "bearish";

export type FadeCheckOptions = {
    pointValue: number;
    riskBudget: number;
    maxContracts: number;
    commissionRoundTrip: number;
};

export type FadeCheckCondition = {
    key: string;
    label: string;
    pass: boolean;
    detail: string;
};

export type FadeCheckResult = {
    side: FadeSide | null;
    trend: FadeTrend | null;
    rangeHigh: number | null;
    rangeLow: number | null;
    rangeWidth: number | null;
    atr: number | null;
    widthAtr: number | null;
    highTouches: number;
    lowTouches: number;
    highRsi: number | null;
    lowRsi: number | null;
    boundaryRsi: number | null;
    currentRsi: number | null;
    divergence: number | null;
    stopPrice: number | null;
    stopDistance: number | null;
    stopAtr: number | null;
    targetPrice: number | null;
    rr: number | null;
    contracts: number;
    failedBreakout: boolean;
    withinTimeWindow: boolean;
    conditions: FadeCheckCondition[];
    overall: boolean;
    reason: string;
};

type SetupMetrics = {
    side: FadeSide | null;
    trend: FadeTrend | null;
    rangeHigh: number | null;
    rangeLow: number | null;
    atr: number | null;
    highTouches: number;
    lowTouches: number;
    highRsi: number | null;
    lowRsi: number | null;
    currentRsi: number | null;
    entryPrice: number;
    stopExtreme: number | null;
    failedBreakout: boolean;
    withinTimeWindow: boolean;
};

const SESSION_TIME_ZONE = "America/New_York";
const SESSION_TIME = new Intl.DateTimeFormat("en-US", {
    timeZone: SESSION_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

export const FADE_ENTRY_START_MINUTE = 13 * 60;
export const FADE_ENTRY_END_MINUTE = 14 * 60 + 20;

function safeNumber(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null, digits = 2): string {
    return value === null ? "—" : value.toFixed(digits);
}

export function etMinute(unixSeconds: number): number {
    const values = Object.fromEntries(
        SESSION_TIME.formatToParts(new Date(unixSeconds * 1000)).map(
            ({ type, value }) => [type, value],
        ),
    );

    return Number(values.hour) * 60 + Number(values.minute);
}

export function isFadeTimeWindow(unixSeconds: number): boolean {
    const minute = etMinute(unixSeconds);
    return minute >= FADE_ENTRY_START_MINUTE && minute <= FADE_ENTRY_END_MINUTE;
}

function simpleAtr(bars: PriceData[], period = 14): number | null {
    if (bars.length < period + 1) return null;

    const sample = bars.slice(-(period + 1));
    let total = 0;

    for (let index = 1; index < sample.length; index += 1) {
        const bar = sample[index];
        const previousClose = sample[index - 1].Price;
        total += Math.max(
            bar.High - bar.Low,
            Math.abs(bar.High - previousClose),
            Math.abs(bar.Low - previousClose),
        );
    }

    return total / period;
}

function emaSeries(bars: PriceData[], period = 200): (number | null)[] {
    const multiplier = 2 / (period + 1);
    let ema: number | null = null;
    let seed: number[] = [];

    return bars.map((bar) => {
        if (ema === null) {
            seed.push(bar.Price);
            if (seed.length < period) return null;
            ema = seed.reduce((sum, value) => sum + value, 0) / period;
            seed = [];
            return ema;
        }

        ema += (bar.Price - ema) * multiplier;
        return ema;
    });
}

function rsiSeries(bars: PriceData[], period = 14): (number | null)[] {
    let previousClose: number | null = null;
    let averageGain = 0;
    let averageLoss = 0;
    let seedGain = 0;
    let seedLoss = 0;
    let seedCount = 0;
    let initialized = false;

    return bars.map((bar) => {
        if (previousClose === null) {
            previousClose = bar.Price;
            return null;
        }

        const change = bar.Price - previousClose;
        previousClose = bar.Price;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        if (!initialized) {
            seedGain += gain;
            seedLoss += loss;
            seedCount += 1;
            if (seedCount < period) return null;
            averageGain = seedGain / period;
            averageLoss = seedLoss / period;
            initialized = true;
        } else {
            averageGain = (averageGain * (period - 1) + gain) / period;
            averageLoss = (averageLoss * (period - 1) + loss) / period;
        }

        if (averageLoss === 0) {
            return averageGain === 0 ? 50 : 100;
        }

        return 100 - 100 / (1 + averageGain / averageLoss);
    });
}

function last<T>(values: T[]): T | null {
    return values.length > 0 ? values[values.length - 1] : null;
}

export function analyzeFadeBars(
    bars: PriceData[],
    options: FadeCheckOptions,
): FadeCheckResult | null {
    if (bars.length < 20) return null;

    const current = bars[bars.length - 1];
    const rangeBars = bars.slice(-16, -1);
    if (rangeBars.length < 15) return null;

    const rangeHigh = Math.max(...rangeBars.map((bar) => bar.High));
    const rangeLow = Math.min(...rangeBars.map((bar) => bar.Low));
    const rangeWidth = rangeHigh - rangeLow;
    if (rangeWidth <= 0) return null;

    const atr = simpleAtr(bars.slice(0, -1));
    const ema = last(emaSeries(bars));
    const rsi = rsiSeries(bars);
    const highBar = [...rangeBars].reverse().find((bar) => bar.High === rangeHigh) ?? null;
    const lowBar = [...rangeBars].reverse().find((bar) => bar.Low === rangeLow) ?? null;
    const highRsi = highBar ? rsi[bars.indexOf(highBar)] ?? null : null;
    const lowRsi = lowBar ? rsi[bars.indexOf(lowBar)] ?? null : null;
    const currentRsi = last(rsi);
    const tolerance = rangeWidth * 0.15;
    const highTouches = rangeBars.filter((bar) => bar.High >= rangeHigh - tolerance).length;
    const lowTouches = rangeBars.filter((bar) => bar.Low <= rangeLow + tolerance).length;

    const brokeAbove = current.High > rangeHigh;
    const brokeBelow = current.Low < rangeLow;
    const closedInside = current.Price < rangeHigh && current.Price > rangeLow;
    let side: FadeSide | null = null;
    let failedBreakout = false;

    if (closedInside && brokeAbove !== brokeBelow) {
        side = brokeAbove ? "short" : "long";
        failedBreakout = true;
    }

    const trend: FadeTrend | null =
        ema === null ? null : current.Price > ema ? "bullish" : "bearish";
    const stopExtreme =
        side === "short" ? current.High : side === "long" ? current.Low : null;

    return evaluateFadeSetup(
        {
            side,
            trend,
            rangeHigh,
            rangeLow,
            atr,
            highTouches,
            lowTouches,
            highRsi,
            lowRsi,
            currentRsi,
            entryPrice: current.Price,
            stopExtreme,
            failedBreakout,
            withinTimeWindow: isFadeTimeWindow(current.Time),
        },
        options,
    );
}

export type ManualFadeInput = {
    side: FadeSide;
    trend: FadeTrend;
    rangeHigh: number;
    rangeLow: number;
    atr: number;
    boundaryRsi: number;
    currentRsi: number;
    stopExtreme: number;
    entryPrice: number;
    touchesOk: boolean;
    failedBreakout: boolean;
};

export function evaluateManualFade(
    input: ManualFadeInput,
    options: FadeCheckOptions,
    withinTimeWindow: boolean,
): FadeCheckResult {
    return evaluateFadeSetup(
        {
            side: input.side,
            trend: input.trend,
            rangeHigh: input.rangeHigh,
            rangeLow: input.rangeLow,
            atr: input.atr,
            highTouches: input.touchesOk ? 2 : 0,
            lowTouches: input.touchesOk ? 2 : 0,
            highRsi: input.side === "short" ? input.boundaryRsi : null,
            lowRsi: input.side === "long" ? input.boundaryRsi : null,
            currentRsi: input.currentRsi,
            entryPrice: input.entryPrice,
            stopExtreme: input.stopExtreme,
            failedBreakout: input.failedBreakout,
            withinTimeWindow,
        },
        options,
    );
}

function evaluateFadeSetup(
    metrics: SetupMetrics,
    options: FadeCheckOptions,
): FadeCheckResult {
    const {
        side,
        trend,
        highTouches,
        lowTouches,
        currentRsi,
        entryPrice,
        stopExtreme,
        failedBreakout,
        withinTimeWindow,
    } = metrics;

    const rangeHigh = safeNumber(metrics.rangeHigh);
    const rangeLow = safeNumber(metrics.rangeLow);
    const atr = safeNumber(metrics.atr);
    const rangeWidth =
        rangeHigh !== null && rangeLow !== null ? rangeHigh - rangeLow : null;
    const widthAtr =
        rangeWidth !== null && atr !== null && atr > 0
            ? rangeWidth / atr
            : null;
    const boundaryRsi =
        side === "short"
            ? safeNumber(metrics.highRsi)
            : side === "long"
              ? safeNumber(metrics.lowRsi)
              : null;
    const divergence =
        boundaryRsi !== null && currentRsi !== null
            ? side === "short"
                ? boundaryRsi - currentRsi
                : currentRsi - boundaryRsi
            : null;
    const stopPrice =
        side === "short" && stopExtreme !== null
            ? stopExtreme + 0.25
            : side === "long" && stopExtreme !== null
              ? stopExtreme - 0.25
              : null;
    const stopDistance =
        stopPrice !== null ? Math.abs(entryPrice - stopPrice) : null;
    const stopAtr =
        stopDistance !== null && atr !== null && atr > 0
            ? stopDistance / atr
            : null;
    const targetPrice =
        side === "short"
            ? rangeLow
            : side === "long"
              ? rangeHigh
              : null;
    const targetDistance =
        targetPrice !== null ? Math.abs(targetPrice - entryPrice) : null;
    const rr =
        stopDistance !== null && stopDistance > 0 && targetDistance !== null
            ? targetDistance / stopDistance
            : null;

    const riskPerContract =
        stopDistance !== null
            ? stopDistance * options.pointValue + options.commissionRoundTrip
            : 0;
    const rawContracts =
        riskPerContract > 0
            ? Math.floor(options.riskBudget / riskPerContract)
            : 0;
    const contracts = Math.max(
        0,
        Math.min(rawContracts, options.maxContracts),
    );

    const trendAligned =
        (side === "long" && trend === "bullish") ||
        (side === "short" && trend === "bearish");
    const widthOk =
        widthAtr !== null && widthAtr >= 0.75 && widthAtr <= 4;
    const touchesOk = highTouches >= 2 && lowTouches >= 2;
    const divergenceOk = divergence !== null && divergence > 0.5;
    const stopOk = stopAtr !== null && stopAtr > 0 && stopAtr <= 0.8;
    const targetOk =
        side === "short"
            ? targetPrice !== null && targetPrice < entryPrice
            : side === "long"
              ? targetPrice !== null && targetPrice > entryPrice
              : false;
    const contractsOk = contracts >= 1;

    const conditions: FadeCheckCondition[] = [
        {
            key: "time",
            label: "Time window",
            pass: withinTimeWindow,
            detail: withinTimeWindow
                ? "13:00–14:20 ET"
                : "Outside 13:00–14:20 ET",
        },
        {
            key: "trend",
            label: "Trend filter",
            pass: trendAligned,
            detail:
                trend === null
                    ? "EMA not ready"
                    : `${trend} vs ${side} setup`,
        },
        {
            key: "width",
            label: "Range width",
            pass: widthOk,
            detail: `${formatNumber(widthAtr)}× ATR (0.75–4.0)`,
        },
        {
            key: "touches",
            label: "Boundary touches",
            pass: touchesOk,
            detail: `${highTouches} high / ${lowTouches} low (min 2 each)`,
        },
        {
            key: "breakout",
            label: "Failed breakout",
            pass: failedBreakout,
            detail: failedBreakout ? "Close back inside" : "No valid failed break",
        },
        {
            key: "rsi",
            label: "RSI divergence",
            pass: divergenceOk,
            detail: `${formatNumber(divergence, 1)} (need > 0.5)`,
        },
        {
            key: "stop",
            label: "Stop distance",
            pass: stopOk,
            detail: `${formatNumber(stopAtr)}× ATR (max 0.8)`,
        },
        {
            key: "target",
            label: "Target side",
            pass: targetOk,
            detail:
                targetPrice === null
                    ? "No target"
                    : `${targetPrice.toFixed(2)}`,
        },
        {
            key: "contracts",
            label: "Contracts",
            pass: contractsOk,
            detail: `${contracts} contract${contracts === 1 ? "" : "s"}`,
        },
    ];

    const firstFailure = conditions.find((condition) => !condition.pass);

    return {
        side,
        trend,
        rangeHigh,
        rangeLow,
        rangeWidth,
        atr,
        widthAtr,
        highTouches,
        lowTouches,
        highRsi: safeNumber(metrics.highRsi),
        lowRsi: safeNumber(metrics.lowRsi),
        boundaryRsi,
        currentRsi,
        divergence,
        stopPrice,
        stopDistance,
        stopAtr,
        targetPrice,
        rr,
        contracts,
        failedBreakout,
        withinTimeWindow,
        conditions,
        overall: firstFailure === undefined,
        reason: firstFailure?.label ?? "All conditions pass",
    };
}
