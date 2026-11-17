/**
 * Candidate B2: RSI dip-buy / rally-sell in the direction of a slow EMA.
 *
 * Chart recipe: 5-minute chart, 200 EMA, session VWAP, RSI(2), ATR(14).
 * In an uptrend (close > 200 EMA) buy the next open after RSI(2) closes below
 * 10 while price is below VWAP. In a downtrend mirror it. Stop 1.5 ATR, target
 * session VWAP. At most 3 trades/day, flat before 16:00 ET.
 *
 * Self-contained: no imports.
 */

const DEFAULTS = {
    rsiPeriod: 2,
    rsiBuy: 10,
    rsiSell: 90,
    trendEma: 200,
    stopAtr: 1.5,
    maxTrades: 3,
    riskDollars: 100,
    maxContracts: 10,
};

export const metadata = {
    apiVersion: 1,
    id: "rsi-dip-5m",
    name: "RSI Dip in Trend (5m RTH)",
    version: "1.0.0",
    description:
        "Buy oversold RSI(2) closes below VWAP while above the 200 EMA; mirror for shorts. ATR stop, VWAP target, max three trades per day.",
    warmupBars: 4000,
    maxLookbackBars: 2,
    parameters: [
        { key: "rsiBuy", label: "RSI buy level", type: "number", default: 10, min: 1, max: 40, step: 1 },
        { key: "rsiSell", label: "RSI sell level", type: "number", default: 90, min: 60, max: 99, step: 1 },
        { key: "trendEma", label: "Trend EMA", type: "number", default: 200, min: 20, max: 400, step: 10 },
        { key: "stopAtr", label: "Stop (ATR multiple)", type: "number", default: 1.5, min: 0.5, max: 4, step: 0.1 },
        { key: "maxTrades", label: "Max trades per day", type: "number", default: 3, min: 1, max: 6, step: 1 },
        { key: "riskDollars", label: "Risk per trade ($)", type: "number", default: 100, min: 10, max: 1000, step: 10 },
        { key: "maxContracts", label: "Max contracts", type: "number", default: 10, min: 1, max: 50, step: 1 },
    ],
};

function etOffsetMinutes(ts) {
    const d = new Date(ts * 1000);
    const y = d.getUTCFullYear();
    const marchFirst = Date.UTC(y, 2, 1) / 1000;
    const marchDow = new Date(marchFirst * 1000).getUTCDay();
    const secondSunMarch = marchFirst + ((7 - marchDow) % 7 + 7) * 86400;
    const novFirst = Date.UTC(y, 10, 1) / 1000;
    const novDow = new Date(novFirst * 1000).getUTCDay();
    const firstSunNov = novFirst + ((7 - novDow) % 7) * 86400;
    return ts >= secondSunMarch && ts < firstSunNov ? -240 : -300;
}

export function createStrategy({ params, instrument }) {
    const p = { ...DEFAULTS, ...params };
    const risk = Number(p.riskDollars);
    const maxContracts = Math.max(1, Math.floor(Number(p.maxContracts)));
    const rsiPeriod = Math.max(2, Math.floor(Number(p.rsiPeriod)));
    const rsiBuy = Number(p.rsiBuy);
    const rsiSell = Number(p.rsiSell);
    const trendEma = Math.max(10, Math.floor(Number(p.trendEma)));
    const stopAtr = Number(p.stopAtr);
    const maxTrades = Math.max(1, Math.floor(Number(p.maxTrades)));
    const emaAlpha = 2 / (trendEma + 1);

    let dayKey = null;
    let tradesToday = 0;
    let lastRthClose = null;
    let atr = null;
    let atrCount = 0;
    let ema = null;
    let prevRsi = null;
    let avgGain = null;
    let avgLoss = null;
    let rsiCount = 0;
    let sumPv = 0;
    let sumV = 0;
    let vwap = null;

    function sessionOf(ts) {
        const local = ts + etOffsetMinutes(ts) * 60;
        const d = new Date(local * 1000);
        const dow = d.getUTCDay();
        const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
        const rth = dow >= 1 && dow <= 5 && minutes >= 570 && minutes < 960;
        const day = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
        return { rth, minutes, day };
    }

    function sizeFor(stopPoints) {
        const perContract = stopPoints * instrument.pointValue + instrument.commissionPerSide * 2;
        if (!(perContract > 0)) return 0;
        const qty = Math.floor(risk / perContract);
        if (qty < 1) return 0;
        return Math.min(qty, maxContracts);
    }

    function update(bar) {
        const first = lastRthClose === null;
        let tr = bar.high - bar.low;
        if (!first) {
            tr = Math.max(tr, Math.abs(bar.high - lastRthClose), Math.abs(bar.low - lastRthClose));
        }
        if (atr === null) atr = tr;
        if (atrCount > 0) {
            const n = Math.min(atrCount, 14);
            atr = atr + (tr - atr) / n;
        }
        atrCount += 1;

        if (ema === null) ema = bar.close;
        else ema = ema + emaAlpha * (bar.close - ema);

        if (lastRthClose !== null) {
            const change = bar.close - lastRthClose;
            const gain = Math.max(0, change);
            const loss = Math.max(0, -change);
            if (avgGain === null) {
                avgGain = gain;
                avgLoss = loss;
            } else {
                const n = Math.min(rsiCount + 1, rsiPeriod);
                avgGain = avgGain + (gain - avgGain) / n;
                avgLoss = avgLoss + (loss - avgLoss) / n;
            }
            rsiCount += 1;
            const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
            prevRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
        }

        const typical = (bar.high + bar.low + bar.close) / 3;
        const v = Math.max(0, bar.volume);
        sumPv += typical * v;
        sumV += v;
        vwap = sumV > 0 ? sumPv / sumV : null;
    }

    return {
        onBar(context) {
            const s = sessionOf(context.bar.time);
            if (!s.rth) {
                if (context.positions.length > 0 && !context.isWarmup) {
                    return { type: "exitAll", reason: "outside_rth" };
                }
                return null;
            }

            const bar = context.bar;

            if (context.isWarmup) {
                if (dayKey !== s.day) {
                    dayKey = s.day;
                    sumPv = 0;
                    sumV = 0;
                    vwap = null;
                    lastRthClose = null;
                }
                update(bar);
                lastRthClose = bar.close;
                return null;
            }

            if (s.day !== dayKey) {
                dayKey = s.day;
                tradesToday = 0;
                lastRthClose = null;
                sumPv = 0;
                sumV = 0;
                vwap = null;
            }

            update(bar);

            if (s.minutes >= 950) {
                lastRthClose = bar.close;
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "session_close" };
                }
                return null;
            }

            if (context.positions.length > 0) {
                lastRthClose = bar.close;
                return null;
            }

            if (tradesToday >= maxTrades || s.minutes >= 870) {
                lastRthClose = bar.close;
                return null;
            }

            if (atr === null || atrCount < 20 || vwap === null || prevRsi === null || ema === null) {
                lastRthClose = bar.close;
                return null;
            }

            const stopPoints = stopAtr * atr;
            if (!(stopPoints > 0)) {
                lastRthClose = bar.close;
                return null;
            }

            let side = null;
            if (bar.close > ema && bar.close < vwap && prevRsi <= rsiBuy) side = "long";
            else if (bar.close < ema && bar.close > vwap && prevRsi >= rsiSell) side = "short";

            lastRthClose = bar.close;
            if (side === null) return null;

            const qty = sizeFor(stopPoints);
            if (qty < 1) return null;

            tradesToday += 1;
            return {
                type: "enter",
                side,
                quantity: qty,
                stopLossPoints: stopPoints,
                takeProfitPoints: Math.min(stopPoints * 3, Math.max(stopPoints * 0.5, Math.abs(vwap - bar.close))),
                tag: `rsi-${side}`,
            };
        },
    };
}
