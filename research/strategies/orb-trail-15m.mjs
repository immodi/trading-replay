/**
 * Candidate A2: Opening Range Breakout with an ATR trailing stop, 15m RTH.
 *
 * Same opening-range entry as A, but no fixed target: once the trade is 1R in
 * profit the stop moves to breakeven, then trails trailAtr * ATR behind the
 * best close. Exit at session close. This is the "let the trend day pay"
 * version of the ORB.
 *
 * Self-contained: no imports.
 */

const DEFAULTS = {
    openingRangeBars: 2,
    stopAtr: 1.5,
    trailAtr: 1.5,
    breakevenR: 1,
    trendEma: 0,
    riskDollars: 100,
    maxContracts: 10,
};

export const metadata = {
    apiVersion: 1,
    id: "orb-trail-15m",
    name: "Opening Range Breakout, ATR trail (15m RTH)",
    version: "1.0.0",
    description:
        "Opening-range breakout with an ATR stop that moves to breakeven at +1R and then trails behind the best close. Flat before 16:00 ET.",
    warmupBars: 4000,
    maxLookbackBars: 4,
    parameters: [
        { key: "openingRangeBars", label: "Opening range bars", type: "number", default: 2, min: 1, max: 8, step: 1 },
        { key: "stopAtr", label: "Initial stop (ATR)", type: "number", default: 1.5, min: 0.5, max: 4, step: 0.1 },
        { key: "trailAtr", label: "Trail (ATR)", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.1 },
        { key: "breakevenR", label: "Breakeven at (R)", type: "number", default: 1, min: 0.5, max: 4, step: 0.1 },
        { key: "trendEma", label: "Trend EMA (0 = off)", type: "number", default: 0, min: 0, max: 200, step: 10 },
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
    const orBars = Math.max(1, Math.floor(Number(p.openingRangeBars)));
    const stopAtr = Number(p.stopAtr);
    const trailAtr = Number(p.trailAtr);
    const breakevenR = Number(p.breakevenR);
    const trendEma = Math.floor(Number(p.trendEma));
    const emaAlpha = trendEma > 0 ? 2 / (trendEma + 1) : 0;

    let dayKey = null;
    let rthCount = 0;
    let orHigh = null;
    let orLow = null;
    let tradedToday = false;
    let lastRthClose = null;
    let ema = null;
    let atr = null;
    let atrCount = 0;

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
        if (emaAlpha > 0) {
            if (ema === null) ema = bar.close;
            else ema = ema + emaAlpha * (bar.close - ema);
        }
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
                update(bar);
                lastRthClose = bar.close;
                return null;
            }

            if (s.day !== dayKey) {
                dayKey = s.day;
                rthCount = 0;
                orHigh = null;
                orLow = null;
                tradedToday = false;
                lastRthClose = null;
            }

            rthCount += 1;
            update(bar);
            lastRthClose = bar.close;

            if (rthCount <= orBars) {
                orHigh = orHigh === null ? bar.high : Math.max(orHigh, bar.high);
                orLow = orLow === null ? bar.low : Math.min(orLow, bar.low);
                return null;
            }

            if (s.minutes >= 945) {
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "session_close" };
                }
                return null;
            }

            if (context.positions.length > 0) {
                const pos = context.positions[0];
                const long = pos.side === "long";
                const stopPoints = pos.stopLossPrice === undefined
                    ? null
                    : long
                      ? pos.entryPrice - pos.stopLossPrice
                      : pos.stopLossPrice - pos.entryPrice;
                if (stopPoints === null) return null;

                const profitPoints = long
                    ? bar.close - pos.entryPrice
                    : pos.entryPrice - bar.close;

                if (profitPoints >= stopPoints * breakevenR) {
                    const trail = trailAtr * atr;
                    const newStop = long ? bar.close - trail : bar.close + trail;
                    // Only tighten: never loosen a stop.
                    const tighter = long
                        ? newStop > pos.stopLossPrice
                        : newStop < pos.stopLossPrice;
                    if (tighter) {
                        return { type: "modify", positionId: pos.id, stopLossPrice: newStop };
                    }
                }
                return null;
            }

            if (tradedToday || s.minutes >= 900) return null;
            if (atr === null || atrCount < 14 || orHigh === null || orLow === null) return null;

            const canLong = trendEma === 0 ? true : ema === null || bar.close > ema;
            const canShort = trendEma === 0 ? true : ema === null || bar.close < ema;

            let side = null;
            if (bar.close > orHigh && canLong) side = "long";
            else if (bar.close < orLow && canShort) side = "short";
            if (side === null) return null;

            const stopPoints = stopAtr * atr;
            if (!(stopPoints > 0)) return null;
            const qty = sizeFor(stopPoints);
            if (qty < 1) return null;

            tradedToday = true;
            return {
                type: "enter",
                side,
                quantity: qty,
                stopLossPoints: stopPoints,
                tag: `orbtrail-${side}`,
            };
        },
    };
}
