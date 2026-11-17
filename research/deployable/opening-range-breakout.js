/**
 * Opening Range Breakout — 15-minute RTH bars, micro futures.
 *
 * Chart recipe (everything a person needs):
 *   1. 15-minute chart, US regular session only (09:30-16:00 ET), ATR(14).
 *   2. Mark the high and low of the first 30 minutes (09:30-10:00 ET).
 *   3. Skip the day if that opening range is wider than 2.25 ATR: the move is
 *      already extended and breakouts there are poor bets.
 *   4. Enter at the next bar open when a 15-minute bar closes above the range
 *      high (long) or below the range low (short). One trade per day.
 *   5. Stop = 1.75 x ATR(14) from the fill; target = 3R.
 *   6. Exit any open position on the 15:45 ET bar (12:45 on exchange half
 *      days), so nothing is held overnight. No entries after 15:00 ET.
 *   7. Do not trade US market holidays. ATR and all levels are built from RTH
 *      bars only, so contract-roll gaps cannot leak into the signal.
 *
 * Position sizing: risk a fixed dollar amount per trade (default $175). The
 * contract count is derived from the stop distance and the instrument's point
 * value, so the same parameter works across MES/MNQ/M2K/MYM/MGC/MCL.
 *
 * This file is self-contained: the app loads strategies from a data: URL, so
 * it must not import anything.
 */

export const metadata = {
    apiVersion: 1,
    id: "orb-30m-rth-15m",
    name: "Opening Range Breakout (30m range, 15m bars)",
    version: "1.0.0",
    description:
        "30-minute opening-range breakout on 15-minute RTH bars, filtered to opening ranges at or below 2.25 ATR. 1.75 ATR stop, 3R target, one trade per day, flat before 16:00 ET, no US market holidays. Risk-based contract sizing.",
    warmupBars: 4000,
    maxLookbackBars: 2,
    parameters: [
        {
            key: "stopAtr",
            label: "Stop (ATR multiple)",
            type: "number",
            default: 1.75,
            min: 0.5,
            max: 4,
            step: 0.25,
        },
        {
            key: "rewardRisk",
            label: "Target (R multiple)",
            type: "number",
            default: 3,
            min: 1,
            max: 6,
            step: 0.5,
        },
        {
            key: "maxOrWidthAtr",
            label: "Max opening range (ATR, 0 = off)",
            type: "number",
            default: 2.25,
            min: 0,
            max: 6,
            step: 0.25,
        },
        {
            key: "riskDollars",
            label: "Risk per trade ($)",
            type: "number",
            default: 175,
            min: 10,
            max: 1000,
            step: 5,
        },
        {
            key: "maxContracts",
            label: "Max contracts",
            type: "number",
            default: 10,
            min: 1,
            max: 50,
            step: 1,
        },
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
    const stopAtr = Number(params.stopAtr);
    const rewardRisk = Number(params.rewardRisk);
    const maxOrWidthAtr = Number(params.maxOrWidthAtr);
    const riskDollars = Number(params.riskDollars);
    const maxContracts = Math.max(1, Math.floor(Number(params.maxContracts)));

    const openingRangeBars = 2; // 30 minutes on 15-minute bars

    let dayKey = null;
    let rthCount = 0;
    let orHigh = null;
    let orLow = null;
    let tradedToday = false;
    let lastRthClose = null;
    let atr = null;
    let atrCount = 0;
    let warmupDayKey = null;

    function sessionOf(ts) {
        const local = ts + etOffsetMinutes(ts) * 60;
        const d = new Date(local * 1000);
        const dow = d.getUTCDay();
        const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
        const rth = dow >= 1 && dow <= 5 && minutes >= 570 && minutes < 960;
        return {
            rth,
            minutes,
            dow,
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            date: d.getUTCDate(),
            day: `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`,
        };
    }

    function nthWeekday(year, month, weekday, nth) {
        const first = new Date(Date.UTC(year, month - 1, 1));
        const offset = (weekday - first.getUTCDay() + 7) % 7;
        return 1 + offset + (nth - 1) * 7;
    }

    function lastWeekday(year, month, weekday) {
        const last = new Date(Date.UTC(year, month, 0));
        const offset = (last.getUTCDay() - weekday + 7) % 7;
        return last.getUTCDate() - offset;
    }

    function easter(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return { month, day };
    }

    function isHoliday(s) {
        if (s.dow < 1 || s.dow > 5) return false;
        const y = s.year;
        const m = s.month;
        const d = s.date;
        const fixed = (fm, fd) => {
            const date = new Date(Date.UTC(y, fm - 1, fd));
            const dow = date.getUTCDay();
            let observed = fd;
            if (dow === 6) observed = fd - 1;
            if (dow === 0) observed = fd + 1;
            return m === fm && d === observed;
        };
        if (fixed(1, 1)) return true;
        if (y >= 2022 && fixed(6, 19)) return true;
        if (fixed(7, 4)) return true;
        if (fixed(12, 25)) return true;
        if (m === 12 && d === 31) {
            if (new Date(Date.UTC(y + 1, 0, 1)).getUTCDay() === 6) return true;
        }
        if (m === 1 && d === 2) {
            if (new Date(Date.UTC(y, 0, 1)).getUTCDay() === 0) return true;
        }
        if (m === 1 && d === nthWeekday(y, 1, 1, 3)) return true;
        if (m === 2 && d === nthWeekday(y, 2, 1, 3)) return true;
        if (m === 5 && d === lastWeekday(y, 5, 1)) return true;
        if (m === 9 && d === nthWeekday(y, 9, 1, 1)) return true;
        if (m === 11 && d === nthWeekday(y, 11, 4, 4)) return true;
        const e = easter(y);
        const goodFriday = new Date(Date.UTC(y, e.month - 1, e.day - 2));
        return m === goodFriday.getUTCMonth() + 1 && d === goodFriday.getUTCDate();
    }

    function isEarlyClose(s) {
        if (s.dow < 1 || s.dow > 5) return false;
        if (isHoliday(s)) return false;
        if (s.month === 11) {
            if (s.date === nthWeekday(s.year, 11, 4, 4) + 1) return true;
        }
        if (s.month === 12 && s.date === 24) return true;
        if (s.month === 7 && s.date === 3) {
            const july4 = new Date(Date.UTC(s.year, 6, 4)).getUTCDay();
            if (july4 >= 2 && july4 <= 5) return true;
        }
        return false;
    }

    function updateIndicators(bar) {
        // RTH-only ATR. The first bar of a session uses high-low so a roll gap
        // between contracts cannot inflate true range.
        const firstOfSession = lastRthClose === null;
        let tr = bar.high - bar.low;
        if (!firstOfSession) {
            tr = Math.max(
                tr,
                Math.abs(bar.high - lastRthClose),
                Math.abs(bar.low - lastRthClose),
            );
        }
        if (atr === null) atr = tr;
        if (atrCount > 0) {
            const n = Math.min(atrCount, 14);
            atr = atr + (tr - atr) / n;
        }
        atrCount += 1;
    }

    function sizeFor(stopPoints) {
        const perContract =
            stopPoints * instrument.pointValue + instrument.commissionPerSide * 2;
        if (!(perContract > 0)) return 0;
        const qty = Math.floor(riskDollars / perContract);
        if (qty < 1) return 0;
        return Math.min(qty, maxContracts);
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
                if (warmupDayKey !== s.day) {
                    warmupDayKey = s.day;
                    lastRthClose = null;
                }
                updateIndicators(bar);
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
            updateIndicators(bar);
            lastRthClose = bar.close;

            if (rthCount <= openingRangeBars) {
                orHigh = orHigh === null ? bar.high : Math.max(orHigh, bar.high);
                orLow = orLow === null ? bar.low : Math.min(orLow, bar.low);
                return null;
            }

            const holiday = isHoliday(s);
            const halfDay = isEarlyClose(s);

            if (holiday) {
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "market_holiday" };
                }
                return null;
            }

            if (s.minutes >= (halfDay ? 765 : 945)) {
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "session_close" };
                }
                return null;
            }

            if (context.positions.length > 0) return null;
            if (tradedToday || s.minutes >= (halfDay ? 720 : 900)) return null;
            if (atr === null || atrCount < 14 || orHigh === null || orLow === null) {
                return null;
            }

            const orWidth = orHigh - orLow;
            if (maxOrWidthAtr > 0 && orWidth > maxOrWidthAtr * atr) return null;

            let side = null;
            if (bar.close > orHigh) side = "long";
            else if (bar.close < orLow) side = "short";
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
                takeProfitPoints: stopPoints * rewardRisk,
                tag: `orb-${side}`,
            };
        },
    };
}
