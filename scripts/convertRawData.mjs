import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join(
    ROOT,
    "data",
    "glbx-mdp3-20210710-20260709.ohlcv-1m.csv",
);
// Keep the generated dataset outside `public/` so Vite never copies it into
// `dist/` (hosts such as Cloudflare Pages reject files over 25 MiB).
const DEFAULT_OUTPUT = path.join(ROOT, "data", "mnq-1m.json");

/** Outright MNQ futures only; calendar spreads are deliberately excluded. */
const OUTRIGHT_SYMBOL = /^MNQ[FGHJKMNQUVXZ]\d$/;

const MONTH_CODES = {
    F: 1,
    G: 2,
    H: 3,
    J: 4,
    K: 5,
    M: 6,
    N: 7,
    Q: 8,
    U: 9,
    V: 10,
    X: 11,
    Z: 12,
};

/** Warn when adjacent bars move by more than this fraction of their price. */
const SUSPICIOUS_JUMP_RATIO = 0.02;

/** Parse the expiry month/year encoded in an outright symbol, e.g. MNQZ6. */
export function parseOutrightSymbol(symbol) {
    if (!OUTRIGHT_SYMBOL.test(symbol)) return null;

    const monthCode = symbol.at(-2);
    const yearDigit = Number(symbol.at(-1));

    return {
        month: MONTH_CODES[monthCode],
        yearDigit,
    };
}

/**
 * Stable sort key for a contract's expiry (year * 12 + zero-based month).
 * A symbol only carries one year digit, so the year is inferred from the
 * first date on which the contract appears in the dataset.
 */
export function contractExpiryKey(symbol, firstSeenDate) {
    const info = parseOutrightSymbol(symbol);
    if (info === null) return Number.POSITIVE_INFINITY;

    const firstYear = Number(firstSeenDate.slice(0, 4));
    const firstMonth = Number(firstSeenDate.slice(5, 7));
    const firstIndex = firstYear * 12 + (firstMonth - 1);

    let year = firstYear;
    while (year % 10 !== info.yearDigit) {
        year++;
    }

    let expiryIndex = year * 12 + (info.month - 1);

    // The contract cannot expire before it first appears. This only matters
    // for a contract first seen after its nominal expiry month, but keeping
    // the rule here makes the inference safe for any slice of the feed.
    if (expiryIndex < firstIndex) {
        expiryIndex += 120;
    }

    return expiryIndex;
}

export function planActiveContracts({ contracts, dailyVolumes, dates }) {
    const activeByDate = new Map();
    let activeIndex = -1;

    const bestFrom = (volumes, minIndex) => {
        let best = null;

        for (let index = minIndex; index < volumes.length; index++) {
            const candidate = volumes[index];

            if (candidate.volume <= 0) continue;

            if (best === null || candidate.volume > best.volume) {
                best = candidate;
            }
        }

        return best;
    };

    for (const date of [...dates].sort()) {
        const volumes = contracts.map((symbol, index) => ({
            index,
            symbol,
            volume: dailyVolumes.get(symbol)?.get(date) ?? 0,
        }));

        if (activeIndex < 0) {
            const best = bestFrom(volumes, 0);

            if (best !== null) {
                activeIndex = best.index;
            }
        } else {
            // Volume-based roll: the next contract becomes active only after
            // it trades more than the current contract on a UTC date. Once we
            // roll forward we never roll back, so a one-day volume blip cannot
            // stitch an older expiry back into the series.
            const best = bestFrom(volumes, activeIndex);

            if (
                best !== null &&
                best.index > activeIndex &&
                best.volume > volumes[activeIndex].volume
            ) {
                activeIndex = best.index;
            }
        }

        if (activeIndex >= 0) {
            activeByDate.set(date, contracts[activeIndex]);
        }
    }

    return activeByDate;
}

async function forEachCsvRow(fileName, callback) {
    const stream = fs.createReadStream(fileName, { encoding: "utf8" });
    const lines = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
    });

    let firstLine = true;

    for await (const rawLine of lines) {
        const line = rawLine.trim();

        if (firstLine) {
            firstLine = false;

            if (line.startsWith("ts_event")) {
                continue;
            }
        }

        if (line === "") continue;

        const columns = line.split(",");

        if (columns.length < 10) {
            throw new Error(`Malformed CSV row: ${line.slice(0, 120)}`);
        }

        callback(columns);
    }
}

function toCandle(columns, lastTime) {
    const time = Math.floor(Date.parse(columns[0]) / 1000);
    const open = Number(columns[4]);
    const high = Number(columns[5]);
    const low = Number(columns[6]);
    const close = Number(columns[7]);
    const volume = Number(columns[8]);

    if (!Number.isFinite(time)) {
        throw new Error(`Invalid timestamp: ${columns[0]}`);
    }

    for (const [name, value] of [
        ["open", open],
        ["high", high],
        ["low", low],
        ["close", close],
        ["volume", volume],
    ]) {
        if (!Number.isFinite(value)) {
            throw new Error(`Non-finite ${name} at ${columns[0]}`);
        }
    }

    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
        throw new Error(`Invalid OHLCV value at ${columns[0]}`);
    }

    if (high < Math.max(open, close) || low > Math.min(open, close)) {
        throw new Error(
            `OHLC constraints violated at ${columns[0]}: ` +
                `open=${open} high=${high} low=${low} close=${close}`,
        );
    }

    if (time <= lastTime) {
        throw new Error(
            `Duplicate or out-of-order timestamp in output: ${columns[0]}`,
        );
    }

    return { time, open, high, low, close, volume };
}

/**
 * Convert a Databento GLBX MDP3 1-minute CSV into the compact JSON array the
 * app consumes. The output is a continuous front-month series built from
 * outright contracts with a daily-volume, forward-only roll policy.
 */
export async function convertCsvToJson({
    input = DEFAULT_INPUT,
    output = DEFAULT_OUTPUT,
    log = console.log,
} = {}) {
    const dailyVolumes = new Map();
    const firstSeen = new Map();
    const dates = new Set();

    await forEachCsvRow(input, (columns) => {
        const symbol = columns[9];

        if (!OUTRIGHT_SYMBOL.test(symbol)) return;

        const date = columns[0].slice(0, 10);
        const volume = Number(columns[8]);

        if (!Number.isFinite(volume) || volume < 0) {
            throw new Error(`Invalid volume at ${columns[0]}`);
        }

        if (!firstSeen.has(symbol)) {
            firstSeen.set(symbol, date);
        }

        let volumes = dailyVolumes.get(symbol);

        if (volumes === undefined) {
            volumes = new Map();
            dailyVolumes.set(symbol, volumes);
        }

        volumes.set(date, (volumes.get(date) ?? 0) + volume);
        dates.add(date);
    });

    if (dates.size === 0) {
        throw new Error(`No outright MNQ futures rows found in ${input}`);
    }

    const contracts = [...firstSeen.keys()].sort(
        (a, b) =>
            contractExpiryKey(a, firstSeen.get(a)) -
            contractExpiryKey(b, firstSeen.get(b)),
    );

    const activeByDate = planActiveContracts({
        contracts,
        dailyVolumes,
        dates,
    });

    const rollDates = [];
    let previousActive = null;

    for (const [date, symbol] of [...activeByDate.entries()].sort()) {
        if (previousActive !== null && symbol !== previousActive) {
            rollDates.push({ date, from: previousActive, to: symbol });
        }

        previousActive = symbol;
    }

    const rollDateSet = new Set(rollDates.map((roll) => roll.date));

    const candles = [];
    let previousCandle = null;
    let previousSymbol = null;
    const jumpWarnings = [];

    await forEachCsvRow(input, (columns) => {
        const symbol = columns[9];

        if (!OUTRIGHT_SYMBOL.test(symbol)) return;

        const date = columns[0].slice(0, 10);

        if (activeByDate.get(date) !== symbol) return;

        const candle = toCandle(
            columns,
            previousCandle === null ? Number.NEGATIVE_INFINITY : previousCandle.time,
        );

        if (previousCandle !== null) {
            const move = Math.abs(candle.close - previousCandle.close);
            const ratio = move / previousCandle.close;

            if (ratio > SUSPICIOUS_JUMP_RATIO) {
                jumpWarnings.push({
                    time: new Date(candle.time * 1000).toISOString(),
                    from: previousCandle.close,
                    to: candle.close,
                    ratio,
                    roll: rollDateSet.has(date) && previousSymbol !== symbol,
                });
            }
        }

        if (candle.time % 60 !== 0) {
            throw new Error(`Candle is not minute-aligned: ${columns[0]}`);
        }

        previousCandle = candle;
        previousSymbol = symbol;
        candles.push(candle);
    });

    fs.mkdirSync(path.dirname(output), { recursive: true });

    const stream = fs.createWriteStream(output, { encoding: "utf8" });
    stream.write("[");

    for (let index = 0; index < candles.length; index++) {
        const row = JSON.stringify(candles[index]);

        if (!stream.write((index === 0 ? "" : ",") + row)) {
            await new Promise((resolve) => stream.once("drain", resolve));
        }
    }

    stream.end("]");
    await new Promise((resolve, reject) => {
        stream.once("finish", resolve);
        stream.once("error", reject);
    });

    log(`Contracts: ${contracts.join(", ")}`);
    log(`Rolls: ${rollDates.length}`);

    for (const roll of rollDates) {
        log(`  ${roll.date}: ${roll.from} -> ${roll.to}`);
    }

    log(`Saved ${candles.length} candles to ${output}`);

    if (jumpWarnings.length > 0) {
        log(
            `WARNING: ${jumpWarnings.length} adjacent close-to-close moves ` +
                `exceeded ${(SUSPICIOUS_JUMP_RATIO * 100).toFixed(1)}%`,
        );

        for (const warning of jumpWarnings.slice(0, 10)) {
            log(
                `  ${warning.time}: ${warning.from} -> ${warning.to} ` +
                    `(${(warning.ratio * 100).toFixed(2)}%` +
                    `${warning.roll ? ", roll" : ""})`,
            );
        }
    }

    return {
        candles: candles.length,
        contracts,
        rollDates,
        jumpWarnings,
    };
}

const invokedDirectly =
    process.argv[1] !== undefined &&
    pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
    convertCsvToJson().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
