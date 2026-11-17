/**
 * One pass over the raw Databento GLBX CSV to reconstruct the front-month
 * rolls the JSON converter created, and measure the splice gap on each roll.
 * This checks whether the continuous series is safe for strategies that
 * reference prices across sessions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_FILES = [
    path.join(ROOT, "data", "glbx-mdp3-20100606-20261110.ohlcv-1m.csv"),
    path.join(ROOT, "data", "mes", "glbx-mdp3-20100606-20261102.ohlcv-1m.csv"),
    path.join(ROOT, "data", "mnq", "glbx-mdp3-20210710-20260709.ohlcv-1m.csv"),
    path.join(ROOT, "data", "mnq", "glbx-mdp3-20260710-20261102.ohlcv-1m.csv"),
];
const OUT = path.join(ROOT, "research", "cache", "rolls.json");
const MONTH = "FGHJKMNQUVXZ";
const ROOTS = new Set(["MES", "MNQ", "M2K", "MYM", "MGC", "MCL"]);

const monthly = new Map(); // root -> contract -> date -> {volume, firstClose, lastClose}
const firstSeen = new Map(); // contractKey -> date
const symbolOf = new Map(); // contractKey -> symbol

function contractKey(root, symbol, instrumentId) {
    return `${root}|${symbol}|${instrumentId}`;
}

function ensure(map, key, make) {
    let value = map.get(key);
    if (value === undefined) {
        value = make();
        map.set(key, value);
    }
    return value;
}

function consume(line) {
    // ts(10) ... open,high,low,close,volume,symbol. Prices are fixed decimals.
    const c1 = line.indexOf(",");
    if (c1 < 0) return;
    const date = line.slice(0, 10);
    const ts = line.slice(11, 19); // HH:MM:SS

    // Fields: ts, rtype, publisher, instrument_id, open, high, low, close,
    // volume, symbol. Each index below is the comma that ends that field.
    const c2 = line.indexOf(",", c1 + 1); // end rtype
    const c3 = line.indexOf(",", c2 + 1); // end publisher
    const c4 = line.indexOf(",", c3 + 1); // end instrument_id
    const c5 = line.indexOf(",", c4 + 1); // end open
    const c6 = line.indexOf(",", c5 + 1); // end high
    const c7 = line.indexOf(",", c6 + 1); // end low
    const c8 = line.indexOf(",", c7 + 1); // end close
    const c9 = line.indexOf(",", c8 + 1); // end volume
    if (c9 < 0) return;
    const instrumentId = line.slice(c3 + 1, c4);
    const close = Number(line.slice(c7 + 1, c8));
    const volume = Number(line.slice(c8 + 1, c9));
    const symbol = line.slice(c9 + 1).trim();

    if (symbol.length < 4 || symbol.length > 5) return;
    const root = symbol.slice(0, 3);
    if (!ROOTS.has(root)) return;
    if (!MONTH.includes(symbol.slice(3, 4))) return;

    const key = contractKey(root, symbol, instrumentId);
    if (!firstSeen.has(key)) {
        firstSeen.set(key, date);
        symbolOf.set(key, symbol);
    }
    if (!Number.isFinite(close) || !Number.isFinite(volume)) return;

    const byDate = ensure(
        ensure(monthly, root, () => new Map()),
        key,
        () => new Map(),
    );
    const day = ensure(byDate, date, () => ({ volume: 0, firstClose: null, lastClose: null, firstTs: null, lastTs: null }));
    day.volume += volume;
    if (day.firstClose === null || ts < day.firstTs) {
        day.firstClose = close;
        day.firstTs = ts;
    }
    if (day.lastClose === null || ts > day.lastTs) {
        day.lastClose = close;
        day.lastTs = ts;
    }
}

for (const csv of CSV_FILES) {
    if (!fs.existsSync(csv)) {
        console.warn("missing", csv);
        continue;
    }
    const stream = fs.createReadStream(csv, { encoding: "utf8", highWaterMark: 16 << 20 });
    let tail = "";
    let headerSkipped = false;
    for await (const chunk of stream) {
        let text = tail + chunk;
        let start = 0;
        for (;;) {
            const nl = text.indexOf("\n", start);
            if (nl < 0) break;
            const line = text.slice(start, nl);
            start = nl + 1;
            if (!headerSkipped) {
                headerSkipped = true;
                if (line.startsWith("ts_event")) continue;
            }
            if (line.length > 20) consume(line);
        }
        tail = text.slice(start);
    }
    if (tail.length > 20) consume(tail);
}

function expiryKey(symbol, firstDate) {
    const monthIndex = MONTH.indexOf(symbol.slice(3, 4));
    const digit = Number(symbol.slice(4, 5));
    const firstYear = Number(firstDate.slice(0, 4));
    let year = firstYear;
    while (year % 10 !== digit) year++;
    let expiry = year * 12 + monthIndex;
    const first = firstYear * 12 + (Number(firstDate.slice(5, 7)) - 1);
    if (expiry < first) expiry += 120;
    return expiry;
}

const result = {};
for (const [root, contractsMap] of monthly) {
    const contracts = [...contractsMap.keys()].sort((a, b) => {
        const ea = expiryKey(symbolOf.get(a), firstSeen.get(a));
        const eb = expiryKey(symbolOf.get(b), firstSeen.get(b));
        return ea - eb || a.localeCompare(b);
    });

    const dates = new Set();
    for (const byDate of contractsMap.values()) for (const date of byDate.keys()) dates.add(date);
    const sortedDates = [...dates].sort();

    let active = -1;
    const activeByDate = new Map();
    for (const date of sortedDates) {
        const volumes = contracts.map((c, i) => ({ i, v: contractsMap.get(c).get(date)?.volume ?? 0 }));
        if (active < 0) {
            const best = volumes.reduce((a, b) => (b.v > a.v ? b : a), { i: -1, v: 0 });
            if (best.v > 0) active = best.i;
        } else {
            const better = volumes.slice(active + 1).reduce((a, b) => (b.v > a.v ? b : a), { i: -1, v: 0 });
            if (better.i >= 0 && better.v > volumes[active].v) active = better.i;
        }
        if (active >= 0) activeByDate.set(date, contracts[active]);
    }

    const rolls = [];
    let prevContract = null;
    let prevDate = null;
    for (const date of sortedDates) {
        const contract = activeByDate.get(date);
        if (prevContract !== null && contract !== prevContract) {
            const oldDay = contractsMap.get(prevContract).get(prevDate);
            const newDay = contractsMap.get(contract).get(date);
            const gapPct =
                oldDay?.lastClose && newDay?.firstClose
                    ? ((newDay.firstClose - oldDay.lastClose) / oldDay.lastClose) * 100
                    : null;
            rolls.push({
                date,
                from: symbolOf.get(prevContract),
                to: symbolOf.get(contract),
                oldLast: oldDay?.lastClose ?? null,
                newFirst: newDay?.firstClose ?? null,
                gapPct: gapPct === null ? null : +gapPct.toFixed(3),
            });
        }
        prevContract = contract;
        prevDate = date;
    }

    const gaps = rolls.map((r) => r.gapPct).filter((g) => g !== null);
    const abs = gaps.map(Math.abs).sort((a, b) => a - b);
    const q = (p) => abs[Math.min(abs.length - 1, Math.floor(abs.length * p))];
    result[root] = {
        contracts: contracts.map((c) => symbolOf.get(c)),
        rolls: rolls.length,
        rollGapAbsPct: {
            median: q(0.5),
            p90: q(0.9),
            max: abs[abs.length - 1],
        },
        biggestRolls: [...rolls]
            .filter((r) => r.gapPct !== null)
            .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
            .slice(0, 8),
        allRolls: rolls,
    };
    console.log(
        `${root}: contracts=${contracts.length} rolls=${rolls.length} ` +
            `abs gap median=${q(0.5)}% p90=${q(0.9)}% max=${abs[abs.length - 1]}%`,
    );
    console.log(
        "  biggest: " +
            result[root].biggestRolls
                .slice(0, 5)
                .map((r) => `${r.date} ${r.from}->${r.to} ${r.gapPct}%`)
                .join(" | "),
    );
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log("wrote", OUT);
