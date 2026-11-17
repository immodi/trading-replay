/**
 * Candidate E: Opening-dip reversion, 15m RTH.
 *
 * Chart recipe: 15-minute chart, ATR(14), prior-day RTH range.
 * At 10:00 ET, measure the opening drive in units of the prior day's RTH range
 * (a stable "daily ATR"). If the first 30 minutes closed down by dipMin..dipMax
 * of that range, buy the next open and hold toward the close. Optional short
 * mirror for a strong up opening. Stop is a multiple of the 15m ATR; exit at
 * 15:45 ET or at an optional target.
 *
 * The entry is deliberately one-shot and time-based: no level, no indicator
 * cross, nothing to reinterpret in real time.
 *
 * Self-contained: no imports.
 */

const DEFAULTS = {
    dipMin: 0.25,
    dipMax: 0.75,
    bothSides: false,
    stopAtr: 1.5,
    targetR: 0,
    riskDollars: 100,
    maxContracts: 10,
};

export const metadata = {
    apiVersion: 1,
    id: "open-dip-15m",
    name: "Opening Dip Reversion (15m RTH)",
    version: "1.0.0",
    description:
        "At 10:00 ET buy after a moderate down opening (0.25-0.75 of the prior day's RTH range); mirror shorts are optional. 15m ATR stop, hold to 15:45 ET unless a target is set.",
    warmupBars: 4000,
    maxLookbackBars: 4,
    parameters: [
        { key: "dipMin", label: "Minimum opening dip (daily range)", type: "number", default: 0.25, min: 0, max: 2, step: 0.05 },
        { key: "dipMax", label: "Maximum opening dip (daily range)", type: "number", default: 0.75, min: 0.1, max: 3, step: 0.05 },
        { key: "bothSides", label: "Short strong up openings", type: "boolean", default: false },
        { key: "stopAtr", label: "Stop (15m ATR multiple)", type: "number", default: 1.5, min: 0.5, max: 4, step: 0.1 },
        { key: "targetR", label: "Target (R, 0 = hold to close)", type: "number", default: 0, min: 0, max: 6, step: 0.5 },
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
    const dipMin = Number(p.dipMin);
    const dipMax = Number(p.dipMax);
    const bothSides = Boolean(p.bothSides);
    const stopAtr = Number(p.stopAtr);
    const targetR = Number(p.targetR);

    let dayKey = null;
    let rthBarsInDay = 0;
    let dayOpen = null;
    let dayHigh = null;
    let dayLow = null;
    let tradedToday = false;
    let lastRthClose = null;
    let atr = null;
    let atrCount = 0;
    let prevDayRange = null;
    let prevDayClose = null;
    let lastCompletedDayRange = null;
    // Daily range ATR (14 completed RTH sessions).
    let dailyRangeAvg = null;
    let dailyCount = 0;

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
    }

    function finishDay() {
        if (dayHigh !== null && dayLow !== null) {
            lastCompletedDayRange = dayHigh - dayLow;
            prevDayClose = lastRthClose;
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

            if (s.day !== dayKey) {
                if (dayKey !== null) finishDay();
                dayKey = s.day;
                rthBarsInDay = 0;
                dayOpen = null;
                dayHigh = null;
                dayLow = null;
                tradedToday = false;
                lastRthClose = null;
                prevDayRange = lastCompletedDayRange;
                if (lastCompletedDayRange !== null) {
                    if (dailyRangeAvg === null) dailyRangeAvg = lastCompletedDayRange;
                    else {
                        const n = Math.min(dailyCount + 1, 14);
                        dailyRangeAvg = dailyRangeAvg + (lastCompletedDayRange - dailyRangeAvg) / n;
                    }
                    dailyCount += 1;
                }
            }

            if (context.isWarmup) {
                rthBarsInDay += 1;
                update(bar);
                dayOpen = dayOpen === null ? bar.open : dayOpen;
                dayHigh = dayHigh === null ? bar.high : Math.max(dayHigh, bar.high);
                dayLow = dayLow === null ? bar.low : Math.min(dayLow, bar.low);
                lastRthClose = bar.close;
                return null;
            }

            rthBarsInDay += 1;
            update(bar);
            dayOpen = dayOpen === null ? bar.open : dayOpen;
            dayHigh = dayHigh === null ? bar.high : Math.max(dayHigh, bar.high);
            dayLow = dayLow === null ? bar.low : Math.min(dayLow, bar.low);

            if (s.minutes >= 945) {
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

            if (tradedToday || rthBarsInDay !== 2) {
                lastRthClose = bar.close;
                return null;
            }

            if (atr === null || atrCount < 14 || dailyRangeAvg === null || dayOpen === null) {
                lastRthClose = bar.close;
                return null;
            }

            const unit = dailyRangeAvg;
            if (!(unit > 0)) {
                lastRthClose = bar.close;
                return null;
            }

            const openingMove = (bar.close - dayOpen) / unit;
            const stopPoints = stopAtr * atr;
            if (!(stopPoints > 0)) {
                lastRthClose = bar.close;
                return null;
            }

            let side = null;
            if (openingMove >= -dipMax && openingMove <= -dipMin) side = "long";
            else if (bothSides && openingMove >= dipMin && openingMove <= dipMax) side = "short";

            lastRthClose = bar.close;
            if (side === null) return null;

            const qty = sizeFor(stopPoints);
            if (qty < 1) return null;
            tradedToday = true;

            return {
                type: "enter",
                side,
                quantity: qty,
                stopLossPoints: stopPoints,
                ...(targetR > 0 ? { takeProfitPoints: stopPoints * targetR } : {}),
                tag: `dip-${side}`,
            };
        },
    };
}
