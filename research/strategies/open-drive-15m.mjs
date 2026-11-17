/**
 * Candidate D: Opening-drive momentum, 15m RTH.
 *
 * Chart recipe: 15-minute chart, ATR(14), session VWAP.
 * At 10:00 ET the first 30 minutes are complete. If that opening drive closed
 * at least driveAtr * ATR away from the session open (and on the same side of
 * VWAP), enter next open in the drive direction. Stop stopAtr * ATR, target
 * rewardRisk * R or trail, flat before 16:00 ET. One trade per day.
 *
 * This is ORB without a level: it only asks whether the open had direction.
 *
 * Self-contained: no imports.
 */

const DEFAULTS = {
    driveAtr: 0.5,
    stopAtr: 1.5,
    rewardRisk: 2,
    trail: false,
    riskDollars: 100,
    maxContracts: 10,
};

export const metadata = {
    apiVersion: 1,
    id: "open-drive-15m",
    name: "Opening Drive (15m RTH)",
    version: "1.0.0",
    description:
        "At 10:00 ET enter in the direction of the first 30-minute drive when it is at least 0.5 ATR and aligned with VWAP. ATR stop, fixed or trailing exit, flat before 16:00 ET.",
    warmupBars: 4000,
    maxLookbackBars: 4,
    parameters: [
        { key: "driveAtr", label: "Minimum drive (ATR)", type: "number", default: 0.5, min: 0.1, max: 3, step: 0.1 },
        { key: "stopAtr", label: "Stop (ATR multiple)", type: "number", default: 1.5, min: 0.5, max: 4, step: 0.1 },
        { key: "rewardRisk", label: "Target (R multiple)", type: "number", default: 2, min: 1, max: 6, step: 0.5 },
        { key: "trail", label: "Trail instead of target", type: "boolean", default: false },
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
    const driveAtr = Number(p.driveAtr);
    const stopAtr = Number(p.stopAtr);
    const rewardRisk = Number(p.rewardRisk);
    const trail = Boolean(p.trail);

    let dayKey = null;
    let rthCount = 0;
    let firstOpen = null;
    let orHigh = null;
    let orLow = null;
    let tradedToday = false;
    let lastRthClose = null;
    let atr = null;
    let atrCount = 0;
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
                    lastRthClose = null;
                    sumPv = 0;
                    sumV = 0;
                    vwap = null;
                }
                update(bar);
                lastRthClose = bar.close;
                return null;
            }

            if (s.day !== dayKey) {
                dayKey = s.day;
                rthCount = 0;
                firstOpen = null;
                orHigh = null;
                orLow = null;
                tradedToday = false;
                lastRthClose = null;
                sumPv = 0;
                sumV = 0;
                vwap = null;
            }

            rthCount += 1;
            update(bar);
            if (firstOpen === null) firstOpen = bar.open;
            orHigh = orHigh === null ? bar.high : Math.max(orHigh, bar.high);
            orLow = orLow === null ? bar.low : Math.min(orLow, bar.low);

            if (s.minutes >= 945) {
                lastRthClose = bar.close;
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "session_close" };
                }
                return null;
            }

            if (context.positions.length > 0) {
                lastRthClose = bar.close;
                if (trail) {
                    const pos = context.positions[0];
                    const long = pos.side === "long";
                    if (pos.stopLossPrice === undefined) return null;
                    const trailStop = long
                        ? bar.close - stopAtr * atr
                        : bar.close + stopAtr * atr;
                    const tighter = long
                        ? trailStop > pos.stopLossPrice
                        : trailStop < pos.stopLossPrice;
                    if (tighter) {
                        return { type: "modify", positionId: pos.id, stopLossPrice: trailStop };
                    }
                }
                return null;
            }

            if (tradedToday || s.minutes >= 900) {
                lastRthClose = bar.close;
                return null;
            }

            // Signal only on the 10:00 ET bar (rthCount 2 on 15m bars).
            if (rthCount !== 2) {
                lastRthClose = bar.close;
                return null;
            }
            if (atr === null || atrCount < 14 || vwap === null || firstOpen === null) {
                lastRthClose = bar.close;
                return null;
            }

            const drive = bar.close - firstOpen;
            const stopPoints = stopAtr * atr;
            if (!(stopPoints > 0)) {
                lastRthClose = bar.close;
                return null;
            }

            let side = null;
            if (drive >= driveAtr * atr && bar.close > vwap) side = "long";
            else if (-drive >= driveAtr * atr && bar.close < vwap) side = "short";

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
                ...(trail ? {} : { takeProfitPoints: stopPoints * rewardRisk }),
                tag: `drive-${side}`,
            };
        },
    };
}
