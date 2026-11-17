/**
 * Gap fade — 15-minute RTH, one contract, low-risk cash account.
 *
 * Chart recipe:
 *   - Prior RTH close and prior RTH range (daily ATR proxy).
 *   - At today's RTH open, gap = (open - prior close) / prior range.
 *   - If gap > gapMin (default 0.5), short; if gap < -gapMin, long.
 *   - Enter at the open (entryBars=0) or after the first 30 minutes
 *     (entryBars=2), depending on the variant.
 *   - Stop = stopAtr * ATR(14) on 15-minute bars.
 *   - Target = prior RTH close (gap fill) when targetPriorClose is true,
 *     otherwise hold to the 15:45 ET flatten.
 *   - One trade per day, no holidays, no overnight.
 *
 * Fixed one contract. The point of this module is minimum dollar risk per
 * trade on a small cash account, not maximum return.
 *
 * Self-contained: no imports.
 */

const DEFAULTS = {
    gapMin: 0.5,
    gapMax: 2.5,
    stopAtr: 1,
    entryBars: 2,
    targetPriorClose: true,
};

export const metadata = {
    apiVersion: 1,
    id: "gap-fade-15m",
    name: "Gap Fade (15m RTH, 1 contract)",
    version: "1.0.0",
    description:
        "Fade an opening gap larger than 0.5 of the prior RTH range. Enter at the open or after 30 minutes, stop 1 ATR(14), target the prior RTH close or hold to 15:45 ET. One contract, one trade per day.",
    warmupBars: 4000,
    maxLookbackBars: 2,
    parameters: [
        { key: "gapMin", label: "Minimum gap (prior-day range)", type: "number", default: 0.5, min: 0.1, max: 2, step: 0.1 },
        { key: "gapMax", label: "Maximum gap (skip extremes)", type: "number", default: 2.5, min: 0.5, max: 5, step: 0.25 },
        { key: "stopAtr", label: "Stop (ATR multiple)", type: "number", default: 1, min: 0.5, max: 3, step: 0.25 },
        { key: "entryBars", label: "Entry after N RTH bars", type: "number", default: 2, min: 1, max: 4, step: 1 },
        { key: "targetPriorClose", label: "Target prior RTH close", type: "boolean", default: true },
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
    const gapMin = Number(p.gapMin);
    const gapMax = Number(p.gapMax);
    const stopAtr = Number(p.stopAtr);
    const entryBars = Math.max(1, Math.floor(Number(p.entryBars)));
    const targetPriorClose = Boolean(p.targetPriorClose);

    let dayKey = null;
    let rthBars = 0;
    let dayOpen = null;
    let lastRthClose = null;
    let lastDayClose = null;
    let dayHigh = null;
    let dayLow = null;
    let prevDayClose = null;
    let prevDayRange = null;
    let atr = null;
    let atrCount = 0;
    let tradedToday = false;

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
        const a = year % 19, b = Math.floor(year / 100), c = year % 100;
        const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        return { month: Math.floor((h + l - 7 * m + 114) / 31), day: ((h + l - 7 * m + 114) % 31) + 1 };
    }
    function isHoliday(s) {
        if (s.dow < 1 || s.dow > 5) return false;
        const y = s.year, m = s.month, day = s.date;
        const fixed = (fm, fd) => {
            const date = new Date(Date.UTC(y, fm - 1, fd));
            const dow = date.getUTCDay();
            let observed = fd;
            if (dow === 6) observed = fd - 1;
            if (dow === 0) observed = fd + 1;
            return m === fm && day === observed;
        };
        if (fixed(1, 1)) return true;
        if (y >= 2022 && fixed(6, 19)) return true;
        if (fixed(7, 4)) return true;
        if (fixed(12, 25)) return true;
        if (m === 12 && day === 31 && new Date(Date.UTC(y + 1, 0, 1)).getUTCDay() === 6) return true;
        if (m === 1 && day === 2 && new Date(Date.UTC(y, 0, 1)).getUTCDay() === 0) return true;
        if (m === 1 && day === nthWeekday(y, 1, 1, 3)) return true;
        if (m === 2 && day === nthWeekday(y, 2, 1, 3)) return true;
        if (m === 5 && day === lastWeekday(y, 5, 1)) return true;
        if (m === 9 && day === nthWeekday(y, 9, 1, 1)) return true;
        if (m === 11 && day === nthWeekday(y, 11, 4, 4)) return true;
        const e = easter(y);
        const gf = new Date(Date.UTC(y, e.month - 1, e.day - 2));
        return m === gf.getUTCMonth() + 1 && day === gf.getUTCDate();
    }
    function isEarlyClose(s) {
        if (s.dow < 1 || s.dow > 5 || isHoliday(s)) return false;
        if (s.month === 11 && s.date === nthWeekday(s.year, 11, 4, 4) + 1) return true;
        if (s.month === 12 && s.date === 24) return true;
        if (s.month === 7 && s.date === 3) {
            const j4 = new Date(Date.UTC(s.year, 6, 4)).getUTCDay();
            return j4 >= 2 && j4 <= 5;
        }
        return false;
    }

    function updateAtr(bar) {
        const first = lastRthClose === null;
        let tr = bar.high - bar.low;
        if (!first) tr = Math.max(tr, Math.abs(bar.high - lastRthClose), Math.abs(bar.low - lastRthClose));
        if (atr === null) atr = tr;
        if (atrCount > 0) atr = atr + (tr - atr) / Math.min(atrCount, 14);
        atrCount += 1;
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
                if (lastDayClose !== null && dayHigh !== null && dayLow !== null) {
                    prevDayClose = lastDayClose;
                    prevDayRange = dayHigh - dayLow;
                }
                dayKey = s.day;
                rthBars = 0;
                dayOpen = null;
                lastRthClose = null;
                dayHigh = null;
                dayLow = null;
                tradedToday = false;
            }

            if (context.isWarmup) {
                rthBars += 1;
                updateAtr(bar);
                if (dayOpen === null) dayOpen = bar.open;
                dayHigh = dayHigh === null ? bar.high : Math.max(dayHigh, bar.high);
                dayLow = dayLow === null ? bar.low : Math.min(dayLow, bar.low);
                lastRthClose = bar.close;
                lastDayClose = bar.close;
                return null;
            }

            rthBars += 1;
            updateAtr(bar);
            if (dayOpen === null) dayOpen = bar.open;
            dayHigh = dayHigh === null ? bar.high : Math.max(dayHigh, bar.high);
            dayLow = dayLow === null ? bar.low : Math.min(dayLow, bar.low);
            lastRthClose = bar.close;
            lastDayClose = bar.close;

            const holiday = isHoliday(s);
            const halfDay = isEarlyClose(s);

            if (holiday) {
                if (context.positions.length > 0) return { type: "exitAll", reason: "market_holiday" };
                return null;
            }

            if (s.minutes >= (halfDay ? 765 : 945)) {
                if (context.positions.length > 0) return { type: "exitAll", reason: "session_close" };
                return null;
            }

            if (context.positions.length > 0) return null;
            if (tradedToday) return null;

            if (rthBars !== entryBars) return null;
            if (prevDayClose === null || prevDayRange === null || prevDayRange <= 0) return null;
            if (atr === null || atrCount < 14) return null;

            const gap = (dayOpen - prevDayClose) / prevDayRange;
            if (Math.abs(gap) < gapMin || Math.abs(gap) > gapMax) return null;

            const side = gap > 0 ? "short" : "long";
            const stopPoints = stopAtr * atr;
            if (!(stopPoints > 0)) return null;

            const targetPrice = prevDayClose;
            // For a short, the prior close must be below the current price; for
            // a long it must be above. Otherwise just hold to the close.
            const targetValid =
                targetPriorClose &&
                (side === "short" ? targetPrice < bar.close : targetPrice > bar.close);

            tradedToday = true;
            return {
                type: "enter",
                side,
                quantity: 1,
                stopLossPoints: stopPoints,
                ...(targetValid ? { takeProfitPrice: targetPrice } : {}),
                tag: `gap-${side}`,
            };
        },
    };
}
