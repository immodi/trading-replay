/**
 * Candidate B: Session VWAP band reversion, 5-minute RTH bars.
 *
 * Chart recipe: 5-minute chart, session VWAP with standard-deviation bands,
 * ATR(14). When a bar closes beyond the -2 SD band but closes green, buy the
 * next open; mirror for shorts. Stop 1.5 ATR, target the session VWAP. At most
 * two trades per day, no entries after 14:30 ET, flat before 16:00 ET.
 *
 * Self-contained: no imports.
 */

const DEFAULTS = {
    bandSigma: 2,
    stopAtr: 1.5,
    maxTrades: 2,
    riskDollars: 100,
    maxContracts: 10,
};

export const metadata = {
    apiVersion: 1,
    id: "vwap-reversion-5m",
    name: "VWAP Band Reversion (5m RTH)",
    version: "1.0.0",
    description:
        "Fade a close outside the 2 SD session-VWAP band when the bar closes back toward VWAP. ATR stop, VWAP target, max two trades per day, flat before 16:00 ET.",
    warmupBars: 4000,
    maxLookbackBars: 2,
    parameters: [
        { key: "bandSigma", label: "VWAP band (SD)", type: "number", default: 2, min: 0.5, max: 4, step: 0.25 },
        { key: "stopAtr", label: "Stop (ATR multiple)", type: "number", default: 1.5, min: 0.5, max: 4, step: 0.1 },
        { key: "maxTrades", label: "Max trades per day", type: "number", default: 2, min: 1, max: 5, step: 1 },
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
    const bandSigma = Number(p.bandSigma);
    const stopAtr = Number(p.stopAtr);
    const maxTrades = Math.max(1, Math.floor(Number(p.maxTrades)));

    let dayKey = null;
    let tradesToday = 0;
    let lastRthClose = null;
    let atr = null;
    let atrCount = 0;
    let vwap = null;
    let sumPv = 0;
    let sumV = 0;
    let sumPv2 = 0;

    function sessionOf(ts) {
        const local = ts + etOffsetMinutes(ts) * 60;
        const d = new Date(local * 1000);
        const dow = d.getUTCDay();
        const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
        const rth = dow >= 1 && dow <= 5 && minutes >= 570 && minutes < 960;
        const day = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
        return { rth, minutes, day };
    }

    function resetSession() {
        dayKey = null;
        tradesToday = 0;
        lastRthClose = null;
        vwap = null;
        sumPv = 0;
        sumV = 0;
        sumPv2 = 0;
    }

    function sizeFor(stopPoints) {
        const perContract = stopPoints * instrument.pointValue + instrument.commissionPerSide * 2;
        if (!(perContract > 0)) return 0;
        const qty = Math.floor(risk / perContract);
        if (qty < 1) return 0;
        return Math.min(qty, maxContracts);
    }

    function updateAtr(bar) {
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
    }

    function updateVwap(bar) {
        const typical = (bar.high + bar.low + bar.close) / 3;
        const v = Math.max(0, bar.volume);
        sumPv += typical * v;
        sumPv2 += typical * typical * v;
        sumV += v;
        if (sumV > 0) vwap = sumPv / sumV;
        else vwap = null;
    }

    function sd() {
        if (sumV <= 0 || vwap === null) return null;
        const variance = Math.max(0, sumPv2 / sumV - vwap * vwap);
        return Math.sqrt(variance);
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

            if (context.isWarmup) {
                if (dayKey !== s.day) {
                    resetSession();
                    dayKey = s.day;
                }
                updateAtr(context.bar);
                updateVwap(context.bar);
                lastRthClose = context.bar.close;
                return null;
            }

            if (s.day !== dayKey) {
                resetSession();
                dayKey = s.day;
            }

            const bar = context.bar;
            updateAtr(bar);
            updateVwap(bar);

            const minutes = s.minutes;

            if (minutes >= 950) {
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "session_close" };
                }
                lastRthClose = bar.close;
                return null;
            }

            if (context.positions.length > 0) {
                lastRthClose = bar.close;
                return null;
            }

            if (tradesToday >= maxTrades || minutes >= 870) {
                lastRthClose = bar.close;
                return null;
            }

            const sigma = sd();
            if (vwap === null || sigma === null || atr === null || atrCount < 14) {
                lastRthClose = bar.close;
                return null;
            }

            const upper = vwap + bandSigma * sigma;
            const lower = vwap - bandSigma * sigma;
            const stopPoints = stopAtr * atr;
            if (!(stopPoints > 0)) {
                lastRthClose = bar.close;
                return null;
            }

            let side = null;
            let target = null;
            if (bar.close < lower && bar.close > bar.open && vwap > bar.close) {
                side = "long";
                target = vwap;
            } else if (bar.close > upper && bar.close < bar.open && vwap < bar.close) {
                side = "short";
                target = vwap;
            }

            lastRthClose = bar.close;
            if (side === null || target === null) return null;

            const distance = Math.abs(target - bar.close);
            if (distance < stopPoints * 0.5) return null;
            const rewardPoints = Math.min(stopPoints * 3, Math.max(stopPoints * 0.5, distance));

            const qty = sizeFor(stopPoints);
            if (qty < 1) return null;

            tradesToday += 1;

            return {
                type: "enter",
                side,
                quantity: qty,
                stopLossPoints: stopPoints,
                takeProfitPoints: rewardPoints,
                tag: `vwap-${side}`,
            };
        },
    };
}
