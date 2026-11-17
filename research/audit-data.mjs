/**
 * Deeper data audit: session coverage, roll-boundary artefacts, suspicious
 * one-minute moves, and higher-timeframe bucket completeness.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "research", "cache");
const SYMBOLS = ["mes", "mnq", "m2k", "mym", "mgc", "mcl"];

function load(symbol) {
    const buf = fs.readFileSync(path.join(CACHE, `${symbol}.bin`));
    if (buf.toString("ascii", 0, 8) !== "TRBARS1\n") throw new Error("bad magic");
    const count = buf.readUInt32LE(8);
    const times = new Uint32Array(count);
    const vals = new Float32Array(count * 5);
    const rawTimes = new Uint32Array(buf.buffer, buf.byteOffset + 12, count);
    const rawVals = new Float32Array(buf.buffer, buf.byteOffset + 12 + count * 4, count * 5);
    times.set(rawTimes);
    vals.set(rawVals);
    return {
        count,
        time: (i) => times[i],
        open: (i) => vals[i * 5],
        high: (i) => vals[i * 5 + 1],
        low: (i) => vals[i * 5 + 2],
        close: (i) => vals[i * 5 + 3],
        volume: (i) => vals[i * 5 + 4],
    };
}

// US Eastern offset in minutes (negative west of UTC), DST rules.
function etOffsetMinutes(ts) {
    const d = new Date(ts * 1000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    // second Sunday in March
    const marchFirst = Date.UTC(y, 2, 1) / 1000;
    const marchDow = new Date(marchFirst * 1000).getUTCDay();
    const secondSunMarch = marchFirst + ((7 - marchDow) % 7 + 7) * 86400;
    // first Sunday in November
    const novFirst = Date.UTC(y, 10, 1) / 1000;
    const novDow = new Date(novFirst * 1000).getUTCDay();
    const firstSunNov = novFirst + ((7 - novDow) % 7) * 86400;
    return ts >= secondSunMarch && ts < firstSunNov ? -240 : -300;
}

function etParts(ts) {
    const local = ts + etOffsetMinutes(ts) * 60;
    const d = new Date(local * 1000);
    return {
        y: d.getUTCFullYear(),
        mo: d.getUTCMonth() + 1,
        d: d.getUTCDate(),
        h: d.getUTCHours(),
        mi: d.getUTCMinutes(),
        dow: d.getUTCDay(),
        minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    };
}

const isRth = (ts) => {
    const p = etParts(ts);
    return p.dow >= 1 && p.dow <= 5 && p.minutes >= 570 && p.minutes < 960;
};

for (const symbol of SYMBOLS) {
    const data = load(symbol);
    const n = data.count;
    const days = new Map();
    const jumps = [];
    let prev = null;
    let rthBars = 0;
    let rthDays = 0;
    const rthPerDay = [];
    const missingMinutes = [];
    let barsAt2300 = 0;
    let barsAt2200 = 0;

    for (let i = 0; i < n; i++) {
        const ts = data.time(i);
        const o = data.open(i);
        const h = data.high(i);
        const l = data.low(i);
        const c = data.close(i);
        const p = etParts(ts);
        if (p.h === 22) barsAt2200++;
        if (p.h === 23) barsAt2300++;

        if (prev) {
            const pc = data.close(prev.i);
            if (pc > 0 && ts === data.time(prev.i) + 60) {
                const pct = ((c - pc) / pc) * 100;
                if (Math.abs(pct) >= 1) {
                    jumps.push({
                        iso: new Date(ts * 1000).toISOString(),
                        pct: +pct.toFixed(2),
                        prevIso: new Date(data.time(prev.i) * 1000).toISOString(),
                        minutes: p.h * 60 + p.mi,
                        rth: isRth(ts),
                        etMonth: p.mo,
                    });
                }
            }
        }

        if (isRth(ts)) {
            rthBars++;
            if (!days.has(p.y * 10000 + p.mo * 100 + p.d)) {
                days.set(p.y * 10000 + p.mo * 100 + p.d, { bars: 0, minutes: new Set(), ts: [] });
            }
            const day = days.get(p.y * 10000 + p.mo * 100 + p.d);
            day.bars++;
            day.minutes.add(p.minutes);
            day.ts.push(ts);
        }
        prev = { i, c };
    }

    for (const [, day] of days) {
        rthDays++;
        rthPerDay.push(day.bars);
        if (day.bars < 360) missingMinutes.push({ bars: day.bars, first: new Date(day.ts[0] * 1000).toISOString() });
    }
    rthPerDay.sort((a, b) => a - b);

    const byMonth = {};
    for (const j of jumps) {
        byMonth[j.pct > 0 ? "up" : "down"] = (byMonth[j.pct > 0 ? "up" : "down"] ?? 0) + 1;
        byMonth.byEtMonth ??= {};
        byMonth.byEtMonth[j.etMonth] = (byMonth.byEtMonth[j.etMonth] ?? 0) + 1;
        byMonth.rth = (byMonth.rth ?? 0) + (j.rth ? 1 : 0);
    }

    // 5m bucket completeness inside RTH: a complete bucket has 5 one-minute bars.
    let partial5 = 0;
    let buckets5 = 0;
    {
        let bucket = null;
        let count = 0;
        for (let i = 0; i < n; i++) {
            const ts = data.time(i);
            if (!isRth(ts)) {
                if (bucket !== null) {
                    buckets5++;
                    if (count < 5) partial5++;
                    bucket = null;
                }
                continue;
            }
            const b = Math.floor(ts / 300) * 300;
            if (bucket === null || b !== bucket) {
                if (bucket !== null) {
                    buckets5++;
                    if (count < 5) partial5++;
                }
                bucket = b;
                count = 1;
            } else count++;
        }
        if (bucket !== null) {
            buckets5++;
            if (count < 5) partial5++;
        }
    }

    const report = {
        symbol,
        rthDays,
        rthBars,
        rthBarsMedian: rthPerDay[Math.floor(rthPerDay.length / 2)],
        rthBarsP1: rthPerDay[Math.floor(rthPerDay.length * 0.01)],
        rthBarsMin: rthPerDay[0],
        rthDaysUnder360: missingMinutes.length,
        worstRthDays: missingMinutes.slice(0, 10),
        partial5mBucketPct: +((partial5 / buckets5) * 100).toFixed(2),
        jumps1pct: jumps.length,
        jumpsInRth: byMonth.rth ?? 0,
        jumpsByEtMonth: byMonth.byEtMonth,
        largestJumps: jumps.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 12)
            .map((j) => `${j.iso.slice(0, 16)} ${j.pct}%${j.rth ? " RTH" : ""}`),
        hoursAt22and23Utc: { h22: barsAt2200, h23: barsAt2300 },
    };
    console.log(JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(CACHE, `${symbol}.audit.json`), JSON.stringify(report, null, 2));
}
