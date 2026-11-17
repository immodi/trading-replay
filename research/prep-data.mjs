/**
 * Convert the app's 1m JSON datasets into a compact binary cache and emit a
 * data-quality report per instrument.
 *
 * Binary layout (little endian):
 *   0..7    magic "TRBARS1\n"
 *   8..11   uint32 bar count
 *   12..    count * uint32  unix seconds
 *   then    count * float32 [open, high, low, close, volume] * 5
 *
 * JSON is one array of {time,open,high,low,close,volume}. The files are a
 * single huge line, so we parse incrementally on the "},{" separator instead
 * of JSON.parse-ing the whole document.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const OUT = path.join(ROOT, "research", "cache");
fs.mkdirSync(OUT, { recursive: true });

const INSTRUMENTS = ["mes", "mnq", "m2k", "mym", "mgc", "mcl"];

function parseBar(json) {
    const bar = JSON.parse(json);
    const { time, open, high, low, close, volume } = bar;
    if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !Number.isFinite(volume)
    ) {
        throw new Error(`Non-finite value in ${json.slice(0, 120)}`);
    }
    return { time, open, high, low, close, volume };
}

async function readBars(file, onBar) {
    const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 8 << 20 });
    let buf = "";
    let last = null;
    let count = 0;

    // Bars are flat objects with no nested braces or strings containing braces,
    // so a brace scan is exact and avoids holding the whole document.
    const scan = (final) => {
        let cursor = 0;
        for (;;) {
            const start = buf.indexOf("{", cursor);
            if (start < 0) {
                cursor = buf.length;
                break;
            }
            const end = buf.indexOf("}", start);
            if (end < 0) {
                cursor = start;
                break;
            }
            const bar = parseBar(buf.slice(start, end + 1));
            if (last !== null && bar.time <= last) {
                throw new Error(`Non-increasing timestamp ${bar.time} after ${last}`);
            }
            last = bar.time;
            count++;
            onBar(bar);
            cursor = end + 1;
        }
        buf = buf.slice(cursor);
        if (final && buf.trim() !== "") {
            throw new Error(`Unparsed trailing data: ${buf.slice(0, 80)}`);
        }
    };

    for await (const chunk of stream) {
        buf += chunk;
        scan(false);
    }
    scan(true);
    if (count === 0) throw new Error(`No bars parsed from ${file}`);
}

function dayKey(sec) {
    return new Date(sec * 1000).toISOString().slice(0, 10);
}

function monthKey(sec) {
    return new Date(sec * 1000).toISOString().slice(0, 7);
}

function hourUtc(sec) {
    return new Date(sec * 1000).getUTCHours();
}

async function prep(symbol) {
    const jsonFile = path.join(DATA, `${symbol}-1m.json`);
    if (!fs.existsSync(jsonFile)) {
        console.log(`skip ${symbol}: ${jsonFile} missing`);
        return null;
    }

    const times = [];
    const values = [];
    const days = new Map();
    const months = new Map();
    const hours = new Array(24).fill(0);
    let previous = null;
    let badOhlc = 0;
    let zeroVolume = 0;
    let gaps1m = 0;
    let dup = 0;
    const bigJumps = [];

    await readBars(jsonFile, (bar) => {
        if (previous !== null) {
            const dt = bar.time - previous.time;
            if (dt === 60) {
                // regular
            } else if (dt === 0) {
                dup++;
            } else if (dt > 60) {
                gaps1m++;
            }
        }
        if (
            bar.high < Math.max(bar.open, bar.close) ||
            bar.low > Math.min(bar.open, bar.close) ||
            bar.high < bar.low
        ) {
            badOhlc++;
        }
        if (bar.volume === 0) zeroVolume++;
        if (previous !== null && previous.close > 0) {
            const ratio = Math.abs(bar.close - previous.close) / previous.close;
            if (ratio > 0.01) {
                bigJumps.push({
                    time: bar.time,
                    iso: new Date(bar.time * 1000).toISOString(),
                    from: previous.close,
                    to: bar.close,
                    pct: +(ratio * 100).toFixed(3),
                });
            }
        }

        times.push(bar.time);
        values.push(bar.open, bar.high, bar.low, bar.close, bar.volume);
        const dk = dayKey(bar.time);
        const day = days.get(dk) ?? { bars: 0, first: bar.time, last: bar.time, volume: 0 };
        day.bars++;
        day.last = bar.time;
        day.volume += bar.volume;
        days.set(dk, day);
        months.set(monthKey(bar.time), (months.get(monthKey(bar.time)) ?? 0) + 1);
        hours[hourUtc(bar.time)]++;
        previous = bar;
    });

    const count = times.length;
    const header = Buffer.alloc(12);
    header.write("TRBARS1\n", 0, "ascii");
    header.writeUInt32LE(count, 8);
    const timeBuf = Buffer.from(new Uint32Array(times).buffer);
    const valueBuf = Buffer.from(new Float32Array(values).buffer);
    fs.writeFileSync(path.join(OUT, `${symbol}.bin`), Buffer.concat([header, timeBuf, valueBuf]));

    // Session coverage: percent of UTC days with any bars, and RTH bar counts.
    const dayList = [...days.entries()].sort();
    const sorted = times;
    const firstTs = sorted[0];
    const lastTs = sorted[sorted.length - 1];
    const rthCounts = [];
    for (const [, day] of dayList) {
        // count RTH 13:30-19:59 UTC is not exact across DST; just record all
        rthCounts.push(day.bars);
    }
    rthCounts.sort((a, b) => a - b);
    const medianBarsPerDay = rthCounts[Math.floor(rthCounts.length / 2)];

    const stats = {
        symbol,
        bars: count,
        first: new Date(firstTs * 1000).toISOString(),
        last: new Date(lastTs * 1000).toISOString(),
        utcDays: dayList.length,
        months: months.size,
        medianBarsPerUtcDay: medianBarsPerDay,
        p10BarsPerUtcDay: rthCounts[Math.floor(rthCounts.length * 0.1)],
        p90BarsPerUtcDay: rthCounts[Math.floor(rthCounts.length * 0.9)],
        zeroVolumeBars: zeroVolume,
        badOhlc,
        duplicateTimestamps: dup,
        gapsGt1m: gaps1m,
        jumps1pct: bigJumps.length,
        biggestJumps: bigJumps.sort((a, b) => b.pct - a.pct).slice(0, 15),
        hourHistogramUtc: hours,
        barsByMonth: [...months.entries()].sort(),
        daysPerMonthMin: (() => {
            const byMonth = new Map();
            for (const [dk] of dayList) {
                const mk = dk.slice(0, 7);
                byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1);
            }
            const arr = [...byMonth.entries()].sort();
            const counts = arr.map((x) => x[1]).sort((a, b) => a - b);
            return {
                min: counts[0],
                median: counts[Math.floor(counts.length / 2)],
                max: counts[counts.length - 1],
                first: arr[0],
                last: arr[arr.length - 1],
                lowest: arr.sort((a, b) => a[1] - b[1]).slice(0, 5),
            };
        })(),
    };

    fs.writeFileSync(
        path.join(OUT, `${symbol}.stats.json`),
        JSON.stringify(stats, null, 2),
    );
    console.log(
        `${symbol}: ${count} bars ${stats.first.slice(0, 10)} -> ${stats.last.slice(0, 10)} ` +
            `days=${stats.utcDays} median/day=${medianBarsPerDay} jumps>1%=${stats.jumps1pct} ` +
            `zeroVol=${zeroVolume} gaps=${gaps1m}`,
    );
    return stats;
}

const only = process.argv.slice(2);
const list = only.length ? only : INSTRUMENTS;
for (const symbol of list) {
    await prep(symbol);
}
