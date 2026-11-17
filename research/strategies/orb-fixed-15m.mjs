/**
 * Candidate A: Opening Range Breakout, 15-minute RTH bars.
 *
 * Chart recipe: 15-minute chart, 50 EMA, ATR(14). Mark the high/low of the
 * first 30 minutes of the US cash session (09:30-10:00 ET). Enter next bar open
 * when a 15-minute bar closes outside that range, in the direction of the 50
 * EMA (optional filter). Stop 1.5 ATR from the entry, target 2R. One trade per
 * day, flat before 16:00 ET.
 *
 * Self-contained: no imports (the app loads strategies as data: URLs).
 */

const DEFAULTS = {
    openingRangeBars: 2,
    stopAtr: 1.5,
    rewardRisk: 2,
    trendEma: 50,
    orWidthMinAtr: 0,
    orWidthMaxAtr: 0,
    riskDollars: 100,
    maxContracts: 10,
};

export const metadata = {
    apiVersion: 1,
    id: "orb-fixed-1",
    name: "ORB fixed 1 contract (15m RTH)",
    version: "1.0.0",
    description:
        "Opening range = first 2 bars of the 09:30 ET session. Breakout close beyond the range, optional 50 EMA trend filter, ATR stop, fixed R target, one trade per day, flat before 16:00 ET.",
    warmupBars: 4000,
    maxLookbackBars: 2,
    parameters: [
        { key: "openingRangeBars", label: "Opening range bars", type: "number", default: 2, min: 1, max: 8, step: 1 },
        { key: "stopAtr", label: "Stop (ATR multiple)", type: "number", default: 1.5, min: 0.5, max: 4, step: 0.1 },
        { key: "rewardRisk", label: "Target (R multiple)", type: "number", default: 2, min: 1, max: 6, step: 0.5 },
        { key: "trendEma", label: "Trend EMA (0 = off)", type: "number", default: 50, min: 0, max: 200, step: 10 },
        { key: "orWidthMinAtr", label: "Min OR width (ATR, 0 = off)", type: "number", default: 0, min: 0, max: 5, step: 0.25 },
        { key: "orWidthMaxAtr", label: "Max OR width (ATR, 0 = off)", type: "number", default: 0, min: 0, max: 8, step: 0.25 },
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
    const rewardRisk = Number(p.rewardRisk);
    const trendEma = Math.floor(Number(p.trendEma));
    const orWidthMinAtr = Number(p.orWidthMinAtr);
    const orWidthMaxAtr = Number(p.orWidthMaxAtr);

    let dayKey = null;
    let rthCount = 0;
    let orHigh = null;
    let orLow = null;
    let tradedToday = false;
    let lastRthClose = null;
    let ema = null;
    let emaCount = 0;
    let atr = null;
    let atrCount = 0;
    let prevTr = null;
    let warmupDayKey = null;

    const emaAlpha = trendEma > 0 ? 2 / (trendEma + 1) : 0;

    function sessionOf(ts) {
        const local = ts + etOffsetMinutes(ts) * 60;
        const d = new Date(local * 1000);
        const dow = d.getUTCDay();
        const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
        const rth = dow >= 1 && dow <= 5 && minutes >= 570 && minutes < 960;
        const day = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
        return {
            rth,
            minutes,
            day,
            dow,
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            date: d.getUTCDate(),
        };
    }

    // US equity market calendar. Holidays and half-days are exchange facts,
    // not fitted parameters: futures print bars on days the cash market is
    // closed, and an opening-range strategy should not trade those sessions.
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
        // Fixed-date holidays, with the NYSE weekend observation rules.
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
        // New Year's Day observed on Dec 31 of the prior year.
        if (m === 12 && d === 31) {
            const next = new Date(Date.UTC(y + 1, 0, 1)).getUTCDay();
            if (next === 6) return true;
        }
        if (m === 1 && d === 2) {
            const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
            if (jan1 === 0) return true;
        }
        if (m === 1 && d === nthWeekday(y, 1, 1, 3)) return true; // MLK
        if (m === 2 && d === nthWeekday(y, 2, 1, 3)) return true; // Presidents
        if (m === 5 && d === lastWeekday(y, 5, 1)) return true; // Memorial
        if (m === 9 && d === nthWeekday(y, 9, 1, 1)) return true; // Labor
        if (m === 11 && d === nthWeekday(y, 11, 4, 4)) return true; // Thanksgiving
        const e = easter(y);
        const goodFriday = new Date(Date.UTC(y, e.month - 1, e.day - 2));
        if (m === goodFriday.getUTCMonth() + 1 && d === goodFriday.getUTCDate()) return true;
        return false;
    }

    function isEarlyClose(s) {
        if (s.dow < 1 || s.dow > 5) return false;
        if (isHoliday(s)) return false;
        if (s.month === 11) {
            const thanksgiving = nthWeekday(s.year, 11, 4, 4);
            if (s.date === thanksgiving + 1) return true;
        }
        if (s.month === 12 && s.date === 24) return true;
        if (s.month === 7 && s.date === 3) {
            const july4 = new Date(Date.UTC(s.year, 6, 4)).getUTCDay();
            if (july4 >= 2 && july4 <= 5) return true;
        }
        return false;
    }

    function sizeFor(stopPoints) {
        const perContract = stopPoints * instrument.pointValue + instrument.commissionPerSide * 2;
        if (!(perContract > 0)) return 0;
        const qty = Math.floor(risk / perContract);
        if (qty < 1) return 0;
        return Math.min(qty, maxContracts);
    }

    return {
        onBar(context) {
            if (context.isWarmup) {
                const s = sessionOf(context.bar.time);
                if (!s.rth) return null;
                if (warmupDayKey !== s.day) {
                    warmupDayKey = s.day;
                    lastRthClose = null;
                }
                updateIndicators(context.bar, s);
                lastRthClose = context.bar.close;
                return null;
            }

            const bar = context.bar;
            const s = sessionOf(bar.time);

            if (!s.rth) {
                // Defensive: never hold through the overnight session.
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "outside_rth" };
                }
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
            updateIndicators(bar, s);
            lastRthClose = bar.close;

            // Opening range accumulation.
            if (rthCount <= orBars) {
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

            // Time-based flatten: exit on the 15:45 ET bar (12:45 on half
            // days), filled at the next open, so nothing is held overnight.
            if (s.minutes >= (halfDay ? 765 : 945)) {
                if (context.positions.length > 0) {
                    return { type: "exitAll", reason: "session_close" };
                }
                return null;
            }

            if (context.positions.length > 0) return null;

            // No new entries in the last trading hour of the session.
            if (tradedToday || s.minutes >= (halfDay ? 720 : 900)) return null;
            if (atr === null || atrCount < 14 || orHigh === null || orLow === null) return null;

            const canLong = trendEma === 0 ? true : ema === null || bar.close > ema;
            const canShort = trendEma === 0 ? true : ema === null || bar.close < ema;

            const orWidth = orHigh - orLow;
            if (orWidthMinAtr > 0 && orWidth < orWidthMinAtr * atr) return null;
            if (orWidthMaxAtr > 0 && orWidth > orWidthMaxAtr * atr) return null;

            let side = null;
            if (bar.close > orHigh && canLong) side = "long";
            else if (bar.close < orLow && canShort) side = "short";
            if (side === null) return null;

            const stopPoints = stopAtr * atr;
            if (!(stopPoints > 0)) return null;
            const qty = 1; // personal-account variant: always one contract
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

    function updateIndicators(bar, s) {
        // ATR from RTH bars only; the first bar of a session uses high-low so a
        // contract-roll gap cannot inflate true range.
        const firstOfSession = lastRthClose === null;
        let tr = bar.high - bar.low;
        if (!firstOfSession) {
            tr = Math.max(tr, Math.abs(bar.high - lastRthClose), Math.abs(bar.low - lastRthClose));
        }
        if (atr === null) {
            if (atrCount === 0) {
                atr = tr;
            }
        }
        if (atrCount > 0 && atr !== null) {
            const n = Math.min(atrCount, 14);
            atr = atr + (tr - atr) / n;
        }
        atrCount += 1;

        if (emaAlpha > 0) {
            if (ema === null) ema = bar.close;
            else ema = ema + emaAlpha * (bar.close - ema);
            emaCount += 1;
        }
        prevTr = tr;
    }
}
