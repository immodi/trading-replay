/**
 * Candidate C: Donchian breakout with EMA trend filter, 15-minute RTH bars.
 *
 * Chart recipe: 15-minute chart, 50 EMA, ATR(14), 20-bar Donchian channel.
 * Buy next open when a bar closes above the prior 20-bar high and above the
 * 50 EMA; mirror for shorts. Stop 1.5 ATR. Exit next open when a bar closes
 * through the prior 10-bar low (long) or high (short), or at session close.
 * One trade per day, flat before 16:00 ET.
 *
 * Self-contained: no imports.
 */

const DEFAULTS = {
    entryLookback: 20,
    exitLookback: 10,
    stopAtr: 1.5,
    riskDollars: 100,
    maxContracts: 10,
};

export const metadata = {
    apiVersion: 1,
    id: "donchian-trend-15m",
    name: "Donchian Trend (15m RTH)",
    version: "1.0.0",
    description:
        "20-bar Donchian breakout in the direction of the 50 EMA, 1.5 ATR stop, exit on the opposite 10-bar channel, one trade per day, flat before 16:00 ET.",
    warmupBars: 4000,
    maxLookbackBars: 64,
    parameters: [
        { key: "entryLookback", label: "Entry channel bars", type: "number", default: 20, min: 5, max: 80, step: 5 },
        { key: "exitLookback", label: "Exit channel bars", type: "number", default: 10, min: 3, max: 40, step: 1 },
        { key: "stopAtr", label: "Stop (ATR multiple)", type: "number", default: 1.5, min: 0.5, max: 4, step: 0.1 },
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
    const entryLookback = Math.max(3, Math.floor(Number(p.entryLookback)));
    const exitLookback = Math.max(2, Math.floor(Number(p.exitLookback)));
    const stopAtr = Number(p.stopAtr);

    // RTH-only rolling window of completed bars (oldest -> newest). The
    // overnight session never enters the channel or the indicators.
    const rthBars = [];
    let dayKey = null;
    let tradedToday = false;
    let lastRthClose = null;
    let ema = null;
    let atr = null;
    let atrCount = 0;

    const emaAlpha = 2 / 51;

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
        const firstOfSession = lastRthClose === null;
        let tr = bar.high - bar.low;
        if (!firstOfSession) {
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
                if (dayKey !== s.day) dayKey = s.day;
                update(bar);
                rthBars.push(bar);
                if (rthBars.length > 256) rthBars.shift();
                lastRthClose = bar.close;
                return null;
            }

            if (s.day !== dayKey) {
                dayKey = s.day;
                tradedToday = false;
                lastRthClose = null;
            }

            update(bar);

            const priorBars = rthBars; // completed RTH bars before the current one

            if (s.minutes >= 945) {
                rthBars.push(bar);
                if (rthBars.length > 256) rthBars.shift();
                lastRthClose = bar.close;
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "session_close" };
                }
                return null;
            }

            if (context.positions.length > 0) {
                if (
                    priorBars.length >= exitLookback &&
                    atr !== null
                ) {
                    const window = priorBars.slice(-exitLookback);
                    let low = Infinity;
                    let high = -Infinity;
                    for (const b of window) {
                        if (b.low < low) low = b.low;
                        if (b.high > high) high = b.high;
                    }
                    const pos = context.positions[0];
                    const exitLong = pos.side === "long" && bar.close < low;
                    const exitShort = pos.side === "short" && bar.close > high;
                    if (exitLong || exitShort) {
                        rthBars.push(bar);
                        if (rthBars.length > 256) rthBars.shift();
                        lastRthClose = bar.close;
                        return { type: "exit", positionId: pos.id, reason: "channel_exit" };
                    }
                }
                rthBars.push(bar);
                if (rthBars.length > 256) rthBars.shift();
                lastRthClose = bar.close;
                return null;
            }

            if (tradedToday || s.minutes >= 900 || atr === null || atrCount < 20 || ema === null) {
                rthBars.push(bar);
                if (rthBars.length > 256) rthBars.shift();
                lastRthClose = bar.close;
                return null;
            }

            if (priorBars.length < entryLookback) {
                rthBars.push(bar);
                if (rthBars.length > 256) rthBars.shift();
                lastRthClose = bar.close;
                return null;
            }

            const window = priorBars.slice(-entryLookback);
            let high = -Infinity;
            let low = Infinity;
            for (const b of window) {
                if (b.high > high) high = b.high;
                if (b.low < low) low = b.low;
            }

            let side = null;
            if (bar.close > high && bar.close > ema) side = "long";
            else if (bar.close < low && bar.close < ema) side = "short";

            rthBars.push(bar);
            if (rthBars.length > 256) rthBars.shift();
            lastRthClose = bar.close;

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
                tag: `donchian-${side}`,
            };
        },
    };
}
