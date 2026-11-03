import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DATA_DIRECTORY = path.join(ROOT, "data");
// Databento exports are split into one file per download window, e.g.
// glbx-mdp3-20210710-20260709.ohlcv-1m.csv. Merge every window in date order.
const INPUT_PATTERN = /^glbx-mdp3-\d{8}-\d{8}\.ohlcv-1m\.csv$/;
const MONTH_CODE_PATTERN = "[FGHJKMNQUVXZ]";
// Keep the generated datasets outside `public/` so Vite never copies them into
// `dist/` (hosts such as Cloudflare Pages reject files over 25 MiB).

/** All Databento CSV windows in `directory`, oldest window first. */
function csvWindows(directory) {
    let entries = [];

    try {
        entries = fs.readdirSync(directory);
    } catch {
        return [];
    }

    return entries
        .filter((entry) => INPUT_PATTERN.test(entry))
        .sort()
        .map((entry) => path.join(directory, entry));
}

/** Databento CSV windows for an instrument, oldest window first. */
export function defaultInputs(symbol = "MNQ") {
    const root = symbol.toUpperCase();
    const instrumentDirectory = path.join(DATA_DIRECTORY, root.toLowerCase());
    const fromInstrumentDirectory = csvWindows(instrumentDirectory);

    if (fromInstrumentDirectory.length > 0) {
        return fromInstrumentDirectory;
    }

    // Backwards compatibility for feeds placed directly in `data/`.
    return csvWindows(DATA_DIRECTORY);
}

/**
 * Instrument roots discovered from subdirectories of `data/`, e.g. `data/mnq`
 * and `data/mes` yield `["MES", "MNQ"]`.
 */
export function discoverInstruments() {
    let entries = [];

    try {
        entries = fs.readdirSync(DATA_DIRECTORY, { withFileTypes: true });
    } catch {
        return [];
    }

    return entries
        .filter(
            (entry) =>
                entry.isDirectory() && /^[a-z]+$/i.test(entry.name),
        )
        .filter(
            (entry) =>
                csvWindows(path.join(DATA_DIRECTORY, entry.name)).length > 0,
        )
        .map((entry) => entry.name.toUpperCase())
        .sort();
}

/** Upload-ready JSON path for an instrument root. */
function defaultOutput(symbol) {
    return path.join(DATA_DIRECTORY, `${symbol.toLowerCase()}-1m.json`);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Outright futures only; calendar spreads are deliberately excluded. */
function outrightPattern(symbol) {
    return new RegExp(
        `^${escapeRegExp(symbol.toUpperCase())}${MONTH_CODE_PATTERN}\\d$`,
    );
}


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
export function parseOutrightSymbol(symbol, rootSymbol = "MNQ") {
    if (!outrightPattern(rootSymbol).test(symbol)) return null;

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
export function contractExpiryKey(symbol, firstSeenDate, rootSymbol = "MNQ") {
    const info = parseOutrightSymbol(symbol, rootSymbol);
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
 * Convert one or more Databento GLBX MDP3 1-minute CSVs into the compact JSON
 * array the app consumes. The output is a continuous front-month series built
 * from outright contracts with a daily-volume, forward-only roll policy.
 * Multiple CSV windows are merged in the order they are supplied (which must
 * be chronological).
 */
export async function convertCsvToJson({
    input,
    inputs,
    symbol = "MNQ",
    output,
    log = console.log,
} = {}) {
    const root = symbol.toUpperCase();
    const outrightSymbol = outrightPattern(root);
    const inputFiles =
        inputs ?? (input === undefined ? defaultInputs(root) : [input]);
    const outputFile = output ?? defaultOutput(root);

    if (inputFiles.length === 0) {
        throw new Error(
            `No Databento CSV files found for ${root} in ${DATA_DIRECTORY}`,
        );
    }

    const dailyVolumes = new Map();
    const firstSeen = new Map();
    const dates = new Set();

    for (const fileName of inputFiles) {
        await forEachCsvRow(fileName, (columns) => {
            const rowSymbol = columns[9];

            if (!outrightSymbol.test(rowSymbol)) return;

            const date = columns[0].slice(0, 10);
            const volume = Number(columns[8]);

            if (!Number.isFinite(volume) || volume < 0) {
                throw new Error(`Invalid volume at ${columns[0]}`);
            }

            if (!firstSeen.has(rowSymbol)) {
                firstSeen.set(rowSymbol, date);
            }

            let volumes = dailyVolumes.get(rowSymbol);

            if (volumes === undefined) {
                volumes = new Map();
                dailyVolumes.set(rowSymbol, volumes);
            }

            volumes.set(date, (volumes.get(date) ?? 0) + volume);
            dates.add(date);
        });
    }

    if (dates.size === 0) {
        throw new Error(
            `No outright ${root} futures rows found in ${inputFiles.join(", ")}`,
        );
    }

    const contracts = [...firstSeen.keys()].sort(
        (a, b) =>
            contractExpiryKey(a, firstSeen.get(a), root) -
            contractExpiryKey(b, firstSeen.get(b), root),
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

    for (const fileName of inputFiles) {
        await forEachCsvRow(fileName, (columns) => {
            const rowSymbol = columns[9];

            if (!outrightSymbol.test(rowSymbol)) return;

            const date = columns[0].slice(0, 10);

            if (activeByDate.get(date) !== rowSymbol) return;

            const candle = toCandle(
                columns,
                previousCandle === null
                    ? Number.NEGATIVE_INFINITY
                    : previousCandle.time,
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
                        roll:
                            rollDateSet.has(date) &&
                            previousSymbol !== rowSymbol,
                    });
                }
            }

            if (candle.time % 60 !== 0) {
                throw new Error(`Candle is not minute-aligned: ${columns[0]}`);
            }

            previousCandle = candle;
            previousSymbol = rowSymbol;
            candles.push(candle);
        });
    }

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    const stream = fs.createWriteStream(outputFile, { encoding: "utf8" });
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

    log(`Instrument: ${root}`);
    log(`Inputs: ${inputFiles.length} CSV file(s)`);
    log(`Contracts: ${contracts.join(", ")}`);
    log(`Rolls: ${rollDates.length}`);

    for (const roll of rollDates) {
        log(`  ${roll.date}: ${roll.from} -> ${roll.to}`);
    }

    log(`Saved ${candles.length} candles to ${outputFile}`);

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
        symbol: root,
        candles: candles.length,
        contracts,
        rollDates,
        jumpWarnings,
    };
}

/**
 * Convert every instrument directory found under `data/` (e.g. `data/mnq`,
 * `data/mes`) into its own upload-ready JSON file.
 */
export async function convertAllInstruments({ log = console.log } = {}) {
    const symbols = discoverInstruments();

    if (symbols.length === 0) {
        throw new Error(`No instrument directories found in ${DATA_DIRECTORY}`);
    }

    const results = [];

    for (const symbol of symbols) {
        log(`\n=== ${symbol} ===`);
        results.push(await convertCsvToJson({ symbol, log }));
    }

    return results;
}

const invokedDirectly =
    process.argv[1] !== undefined &&
    pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
    const symbols = process.argv.slice(2);
    const run =
        symbols.length === 0
            ? convertAllInstruments()
            : (async () => {
                  for (const symbol of symbols) {
                      await convertCsvToJson({ symbol });
                  }
              })();

    run.catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
