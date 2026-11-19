import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright-core";

import {
    downloadCsv,
    openHistoricalPage,
    SessionExpiredError,
    applyDateRange,
    readFirstAndLastAvailableDates,
} from "./historical.ts";
import { parseDailyCsv } from "./csv.ts";
import type { CsvFormat } from "./csv.ts";
import {
    barDate,
    barFileName,
    ensureDirectory,
    mergeBars,
    nextUtcDate,
    readBars,
    readManifest,
    upsertManifestEntry,
    writeBars,
    writeManifest,
} from "./storage.ts";
import { CACHE_DIR } from "./paths.ts";
import { log, retryLabel, sleep, warn } from "./log.ts";
import type { CliOptions } from "./args.ts";
import type {
    ComponentStock,
    DailyBar,
    Manifest,
    StockMetadata,
} from "./types.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Investing.com's CSV export tops out at 5,000 rows. A result at or near the
 * cap means the requested range was truncated and must be fetched in chunks.
 */
const DOWNLOAD_ROW_CAP = 4_900;
const CHUNK_YEARS = 10;

function subtractCalendarDays(date: string, days: number): string {
    const [year, month, day] = date.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day));
    shifted.setUTCDate(shifted.getUTCDate() - days);
    return shifted.toISOString().slice(0, 10);
}

function addYearsMinusOneDay(date: string, years: number): string {
    const [year, month, day] = date.split("-").map(Number);
    const shifted = new Date(Date.UTC(year + years, month - 1, day));
    shifted.setUTCDate(shifted.getUTCDate() - 1);
    return shifted.toISOString().slice(0, 10);
}

function minDate(left: string, right: string): string {
    return left <= right ? left : right;
}

function assertDate(value: string, flag: string): string {
    if (!DATE_PATTERN.test(value)) {
        throw new Error(`${flag} must be YYYY-MM-DD, got "${value}".`);
    }

    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.toISOString().slice(0, 10) !== value) {
        throw new Error(`${flag} is not a valid date: "${value}".`);
    }

    return value;
}

function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function lower(value: string): string {
    return value.trim().toLowerCase();
}

function matchesSymbol(
    stock: ComponentStock,
    ticker: string | null,
    symbols: string[],
): boolean {
    if (symbols.length === 0) return true;

    const wanted = new Set(symbols.map(lower));
    return (
        wanted.has(lower(stock.slug)) ||
        wanted.has(lower(stock.name)) ||
        (ticker !== null && wanted.has(lower(ticker)))
    );
}

function prefilterByKnownManifest(
    stocks: ComponentStock[],
    manifest: Manifest,
    symbols: string[],
): ComponentStock[] {
    if (symbols.length === 0) return stocks;

    const wanted = new Set(symbols.map(lower));
    const knownSlugs = new Set(
        manifest.stocks
            .filter((entry) => wanted.has(lower(entry.symbol)))
            .map((entry) => entry.slug),
    );

    return stocks.filter(
        (stock) =>
            wanted.has(lower(stock.slug)) ||
            wanted.has(lower(stock.name)) ||
            knownSlugs.has(stock.slug),
    );
}

function stockCacheFile(
    ticker: string,
    mode: "full" | "append" | "today",
    chunk: number,
): string {
    const directory = path.join(CACHE_DIR, "csv");
    ensureDirectory(directory);
    return path.join(
        directory,
        `${ticker.replace(/[^A-Za-z0-9_-]+/g, "-")}-${mode}-${chunk}.csv`,
    );
}

async function downloadRange(options: {
    page: Page;
    ticker: string;
    mode: "full" | "append" | "today";
    startDate: string;
    endDate: string;
    chunk: number;
    verbose: boolean;
}): Promise<{
    bars: DailyBar[];
    skipped: number;
    skippedRows: string[];
    format: CsvFormat;
} | null> {
    const rows = await applyDateRange(
        options.page,
        options.startDate,
        options.endDate,
        { verbose: options.verbose },
    );

    if (rows === 0) {
        if (options.verbose) {
            log(`  no rows for ${options.startDate} → ${options.endDate}`);
        }
        return null;
    }

    const csvFile = stockCacheFile(options.ticker, options.mode, options.chunk);
    await downloadCsv(options.page, csvFile, {
        verbose: options.verbose,
    });

    const parsed = parseDailyCsv(fs.readFileSync(csvFile, "utf8"));

    return {
        bars: parsed.bars,
        skipped: parsed.skipped,
        skippedRows: parsed.skippedRows,
        format: parsed.format,
    };
}

/**
 * Download a date range, continuing in chunks when Investing.com truncates the
 * result at its 5,000-row CSV cap.
 */
async function downloadRangeChunked(options: {
    page: Page;
    ticker: string;
    mode: "full" | "append" | "today";
    startDate: string;
    endDate: string;
    verbose: boolean;
}): Promise<{
    bars: DailyBar[];
    skipped: number;
    skippedRows: string[];
    format: CsvFormat | null;
}> {
    let merged: DailyBar[] = [];
    let skipped = 0;
    const skippedRows: string[] = [];
    let format: CsvFormat | null = null;
    let chunk = 0;

    const first = await downloadRange({
        page: options.page,
        ticker: options.ticker,
        mode: options.mode,
        startDate: options.startDate,
        endDate: options.endDate,
        chunk,
        verbose: options.verbose,
    });
    chunk += 1;

    if (first === null) {
        return { bars: [], skipped: 0, skippedRows: [], format: null };
    }

    merged = first.bars;
    skipped += first.skipped;
    skippedRows.push(...first.skippedRows.slice(0, 5));
    format = first.format;

    log(
        `  CSV format: ${format.kind}${format.kind === "header" ? ` [${format.header?.join(", ")}]` : ""} · dates ${format.dateStyle} · volume ${format.volumeStyle}`,
    );

    if (merged.length < DOWNLOAD_ROW_CAP) {
        return { bars: merged, skipped, skippedRows, format };
    }

    // The requested range hit the CSV cap. Continue forward from the last bar
    // that was returned, in ten-year windows, until the requested end date.
    let cursor = nextUtcDate(barDate(merged[merged.length - 1].time));

    while (cursor <= options.endDate) {
        const chunkEnd = minDate(
            options.endDate,
            addYearsMinusOneDay(cursor, CHUNK_YEARS),
        );

        if (options.verbose) {
            log(`  chunk ${chunk + 1}: ${cursor} → ${chunkEnd}`);
        }

        const result = await downloadRange({
            page: options.page,
            ticker: options.ticker,
            mode: options.mode,
            startDate: cursor,
            endDate: chunkEnd,
            chunk,
            verbose: options.verbose,
        });

        chunk += 1;

        if (result !== null) {
            merged = mergeBars(merged, result.bars);
            skipped += result.skipped;

            for (const row of result.skippedRows) {
                if (skippedRows.length < 5) skippedRows.push(row);
            }

            if (
                result.bars.length >= DOWNLOAD_ROW_CAP &&
                barDate(result.bars[result.bars.length - 1].time) < chunkEnd
            ) {
                // Still capped inside this window; continue from its last bar.
                cursor = nextUtcDate(
                    barDate(result.bars[result.bars.length - 1].time),
                );
                continue;
            }
        }

        cursor = nextUtcDate(chunkEnd);
    }

    return { bars: merged, skipped, skippedRows, format };
}

async function processStock(options: {
    page: Page;
    stock: ComponentStock;
    mode: "full" | "append" | "today";
    outputDir: string;
    manifest: Manifest;
    from: string | null;
    to: string | null;
    days: number | null;
    createMissing: boolean;
    verbose: boolean;
    retries: number;
    symbols: string[];
}): Promise<{
    entry: Manifest["stocks"][number];
    written: number;
    skipped: boolean;
    unmatched: boolean;
    noData: boolean;
}> {
    const metadata = await openHistoricalPage(options.page, options.stock.slug, {
        retries: options.retries,
        verbose: options.verbose,
    });

    const fileName = barFileName(metadata.ticker);
    const outputFile = path.join(options.outputDir, fileName);
    const existing = readBars(outputFile);

    if (!matchesSymbol(options.stock, metadata.ticker, options.symbols)) {
        return {
            entry: toManifestEntry(metadata, fileName, existing ?? []),
            written: 0,
            skipped: true,
            unmatched: true,
            noData: false,
        };
    }

    // "today" mode always writes a fresh window. Remove any previous file for
    // this symbol so a failed/empty fetch cannot leave stale bars behind.
    if (options.mode === "today" && existing !== null) {
        fs.rmSync(outputFile, { force: true });
    }

    const bounds = await readFirstAndLastAvailableDates(options.page);
    const siteMax = bounds.max || todayUtc();
    const maxDate =
        options.mode === "today"
            ? minDate(
                  options.to === null ? todayUtc() : assertDate(options.to, "--to"),
                  siteMax,
              )
            : options.to === null
              ? siteMax
              : assertDate(options.to, "--to");

    let startDate: string;
    let appendExisting: DailyBar[] = [];

    if (options.mode === "today") {
        const days = options.days ?? 1;
        startDate =
            options.from === null
                ? subtractCalendarDays(maxDate, days - 1)
                : assertDate(options.from, "--from");
    } else if (options.mode === "append" && existing !== null && existing.length > 0) {
        const lastDate = barDate(existing[existing.length - 1].time);
        startDate =
            options.from === null ? nextUtcDate(lastDate) : assertDate(options.from, "--from");

        if (startDate > lastDate && startDate <= maxDate) {
            appendExisting = existing;
        } else if (startDate > maxDate) {
            const entry = toManifestEntry(
                metadata,
                fileName,
                existing,
            );
            return { entry, written: 0, skipped: true, unmatched: false, noData: false };
        } else {
            appendExisting = existing;
        }
    } else if (options.mode === "append" && !options.createMissing) {
        throw new Error(
            `Append requested but ${fileName} does not exist. Re-run with --create-missing or use --mode full.`,
        );
    } else {
        startDate =
            options.from === null
                ? (bounds.min || "1970-01-01")
                : assertDate(options.from, "--from");
    }

    if (startDate > maxDate) {
        if (options.mode === "full") {
            throw new Error(
                `Start date ${startDate} is after the end date ${maxDate}.`,
            );
        }

        return {
            entry: toManifestEntry(metadata, fileName, existing ?? []),
            written: 0,
            skipped: true,
            unmatched: false,
            noData: false,
        };
    }

    if (options.verbose) {
        log(
            `  ${metadata.ticker} · ${options.stock.name} · ${startDate} → ${maxDate}`,
        );
    }

    const rangeResult = await downloadRangeChunked({
        page: options.page,
        ticker: metadata.ticker,
        mode: options.mode,
        startDate,
        endDate: maxDate,
        verbose: options.verbose,
    });

    const startTimestamp = Date.parse(`${startDate}T00:00:00Z`) / 1000;
    const endTimestamp = Date.parse(`${maxDate}T23:59:59Z`) / 1000;
    const incoming =
        options.mode === "append"
            ? rangeResult.bars.filter((bar) => bar.time >= startTimestamp)
            : options.mode === "today"
              ? rangeResult.bars.filter(
                    (bar) => bar.time >= startTimestamp && bar.time <= endTimestamp,
                )
              : rangeResult.bars;

    if (incoming.length === 0) {
        if (options.mode === "append") {
            return {
                entry: toManifestEntry(metadata, fileName, appendExisting),
                written: 0,
                skipped: true,
                unmatched: false,
                noData: false,
            };
        }

        if (options.mode === "today") {
            return {
                entry: toManifestEntry(metadata, fileName, []),
                written: 0,
                skipped: true,
                unmatched: false,
                noData: true,
            };
        }

        throw new Error(`No historical rows were returned for ${metadata.ticker}.`);
    }

    const merged =
        appendExisting.length > 0
            ? mergeBars(appendExisting, incoming)
            : mergeBars([], incoming);

    writeBars(outputFile, merged);

    const entry = toManifestEntry(metadata, fileName, merged);
    upsertManifestEntry(options.manifest, entry);
    writeManifest(options.outputDir, options.manifest);

    if (rangeResult.skipped > 0) {
        warn(
            `${metadata.ticker}: skipped ${rangeResult.skipped} malformed CSV row(s). First: ${rangeResult.skippedRows.join(" || ")}`,
        );
    }

    return {
        entry,
        written:
            appendExisting.length > 0
                ? Math.max(0, merged.length - appendExisting.length)
                : merged.length,
        skipped: false,
        unmatched: false,
        noData: false,
    };
}

function toManifestEntry(
    metadata: StockMetadata,
    fileName: string,
    bars: DailyBar[],
): Manifest["stocks"][number] {
    const first = bars[0];
    const last = bars[bars.length - 1];

    return {
        symbol: metadata.ticker,
        name: metadata.name,
        slug: metadata.slug,
        fileName,
        assetClass: "stock",
        currency: "EGP",
        pointValue: 1,
        commission: 0,
        baseTimeframeMinutes: 1440,
        rows: bars.length,
        firstDate: first === undefined ? null : barDate(first.time),
        lastDate: last === undefined ? null : barDate(last.time),
        updatedAt: new Date().toISOString(),
    };
}

export async function runDownload(options: {
    cli: CliOptions;
    page: Page;
    stocks: ComponentStock[];
    outputDir: string;
}): Promise<void> {
    const { cli, page } = options;
    ensureDirectory(options.outputDir);

    const manifest = readManifest(options.outputDir);
    const filtered = prefilterByKnownManifest(
        options.stocks,
        manifest,
        cli.symbols,
    );

    if (cli.symbols.length > 0 && filtered.length === 0) {
        throw new Error(
            `No components matched --symbols ${cli.symbols.join(",")}. Use the "components" command to see names/slugs, or use a ticker already present in manifest.json.`,
        );
    }

    const stocks =
        cli.limit === null ? filtered : filtered.slice(0, cli.limit);

    log(
        `Mode: ${cli.mode} · ${stocks.length} stock(s) · output ${options.outputDir}`,
    );

    if (cli.dryRun) {
        for (const stock of stocks) {
            log(`  ${stock.name} (${stock.slug})`);
        }
        return;
    }

    const failures: Array<{ symbol: string; message: string }> = [];
    const startedAt = new Date().toISOString();
    let downloaded = 0;
    let skipped = 0;
    let noData = 0;

    for (let index = 0; index < stocks.length; index += 1) {
        const stock = stocks[index];
        const label = `[${index + 1}/${stocks.length}] ${stock.name} (${stock.slug})`;
        log(label);

        let lastError: unknown = null;
        let handled = false;

        for (let attempt = 0; attempt <= cli.retries; attempt += 1) {
            try {
                // `processStock` resolves the ticker; when a --symbols filter
                // names a ticker we only know it after opening the page.
                const result = await processStock({
                    page,
                    stock,
                    mode: cli.mode,
                    outputDir: options.outputDir,
                    manifest,
                    from: cli.from,
                    to: cli.to,
                    days: cli.days,
                    createMissing: cli.createMissing,
                    verbose: cli.verbose,
                    retries: cli.retries,
                    symbols: cli.symbols,
                });

                if (result.unmatched) {
                    log("  skipped (does not match --symbols)");
                } else if (result.noData) {
                    noData += 1;
                    log("  no rows in the requested window");
                } else if (result.skipped) {
                    skipped += 1;
                    log(
                        `  up to date${result.entry.lastDate ? ` (last ${result.entry.lastDate})` : ""}`,
                    );
                } else {
                    downloaded += 1;
                    log(
                        `  wrote ${result.written.toLocaleString()} bar(s) · ${result.entry.firstDate} → ${result.entry.lastDate}`,
                    );
                }

                handled = true;
                break;
            } catch (error) {
                lastError = error;

                if (error instanceof SessionExpiredError) {
                    throw new Error(
                        `${error.message} Run "pnpm auth" and try again.`,
                    );
                }

                if (attempt < cli.retries) {
                    const waitMs = 2000 * (attempt + 1);
                    warn(
                        `${stock.slug}: ${error instanceof Error ? error.message : String(error)}. Retrying in ${waitMs}ms…${retryLabel(attempt, cli.retries + 1)}`,
                    );
                    await page.waitForTimeout(waitMs);
                }
            }
        }

        if (!handled) {
            const message =
                lastError instanceof Error
                    ? lastError.message
                    : String(lastError);
            failures.push({ symbol: stock.slug, message });
            warn(`${stock.slug}: failed — ${message}`);
        }

        if (index < stocks.length - 1 && cli.delayMs > 0) {
            await sleep(cli.delayMs);
        }
    }

    manifest.lastRun = {
        mode: cli.mode,
        startedAt,
        finishedAt: new Date().toISOString(),
        failures,
    };
    writeManifest(options.outputDir, manifest);

    log("");
    log(
        `Done · ${downloaded} downloaded · ${skipped} up to date · ${noData} with no rows · ${failures.length} failed`,
    );

    if (failures.length > 0) {
        for (const failure of failures) {
            warn(`${failure.symbol}: ${failure.message}`);
        }
        throw new Error(`${failures.length} stock(s) failed.`);
    }
}
