import fs from "node:fs";

import { parseArgs, HELP } from "./args.ts";
import {
    hasSavedAuth,
    launchBrowser,
    requireSavedAuth,
    resolveChromiumPath,
    saveStorageState,
} from "./browser.ts";
import { loadComponents } from "./components.ts";
import { runDownload } from "./download.ts";
import { openHistoricalPage } from "./historical.ts";
import { runLogin } from "./login.ts";
import {
    COMPONENTS_URLS,
    DEFAULT_AUTH_FILE,
    DEFAULT_OUTPUT_DIR,
    resolvePath,
} from "./paths.ts";
import { error, log, sleep, warn } from "./log.ts";
import type { ComponentStock } from "./types.ts";

function loadKnownMap(fileName: string | null): Record<string, string> {
    if (fileName === null) return {};

    const resolved = resolvePath(fileName, fileName);
    if (!fs.existsSync(resolved)) {
        throw new Error(`--known file not found: ${resolved}`);
    }

    const payload = JSON.parse(fs.readFileSync(resolved, "utf8")) as unknown;
    const mapping: Record<string, string> = {};

    const add = (slug: unknown, symbol: unknown): void => {
        if (
            typeof slug === "string" &&
            typeof symbol === "string" &&
            slug !== "" &&
            symbol !== ""
        ) {
            mapping[slug] = symbol;
        }
    };

    if (Array.isArray(payload)) {
        for (const item of payload) {
            if (item && typeof item === "object") {
                const row = item as Record<string, unknown>;
                add(row.slug, row.symbol);
            }
        }
        return mapping;
    }

    if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        if (Array.isArray(record.stocks)) {
            for (const item of record.stocks) {
                if (item && typeof item === "object") {
                    const row = item as Record<string, unknown>;
                    add(row.slug, row.symbol);
                }
            }
            return mapping;
        }

        for (const [slug, symbol] of Object.entries(record)) {
            if (typeof symbol === "string") add(slug, symbol);
        }
    }

    return mapping;
}

function matchesUniverseFilter(
    stock: ComponentStock,
    knownSymbol: string | undefined,
    symbols: string[],
): boolean {
    if (symbols.length === 0) return true;
    const wanted = new Set(symbols.map((value) => value.toLowerCase()));
    return (
        wanted.has(stock.slug.toLowerCase()) ||
        wanted.has(stock.name.toLowerCase()) ||
        (knownSymbol !== undefined && wanted.has(knownSymbol.toLowerCase()))
    );
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));

    if (options.command === "help") {
        log(HELP);
        return;
    }

    const authFile = resolvePath(options.authFile, DEFAULT_AUTH_FILE);
    const outputDir = resolvePath(options.outputDir, DEFAULT_OUTPUT_DIR);
    const chromiumPath = resolveChromiumPath(options.chromiumPath);

    if (options.command === "login") {
        await runLogin({
            authFile,
            chromiumPath,
            verbose: options.verbose,
            waitFile:
                options.loginWaitFile === null
                    ? null
                    : resolvePath(options.loginWaitFile, options.loginWaitFile),
        });
        return;
    }

    if (options.command === "components") {
        log(`Chromium: ${chromiumPath}`);

        const { browser, context } = await launchBrowser({
            headless: options.headless ?? true,
            chromiumPath,
            authFile: hasSavedAuth(authFile) ? authFile : null,
            verbose: options.verbose,
        });

        try {
            const page = await context.newPage();
            const stocks = await loadComponents(page, {
                retries: options.retries,
                verbose: options.verbose,
                index: options.index,
            });

            log(`${stocks.length} ${options.index.toUpperCase()} component(s):`);
            for (const stock of stocks) {
                log(`${stock.name}\t${stock.slug}`);
            }
        } finally {
            await browser.close().catch(() => undefined);
        }

        return;
    }

    if (options.command === "universe") {
        const known = loadKnownMap(options.knownFile);
        const emit = options.json
            ? (message: string) => process.stderr.write(`${message}\n`)
            : log;
        const verbose = options.verbose && !options.json;

        emit(`Chromium: ${chromiumPath}`);

        const { browser, context } = await launchBrowser({
            headless: options.headless ?? true,
            chromiumPath,
            authFile: hasSavedAuth(authFile) ? authFile : null,
            verbose,
        });

        try {
            const page = await context.newPage();
            const stocks = await loadComponents(page, {
                retries: options.retries,
                verbose,
                index: options.index,
            });

            const filtered = stocks.filter((stock) =>
                matchesUniverseFilter(stock, known[stock.slug], options.symbols),
            );
            const selected =
                options.limit === null
                    ? filtered
                    : filtered.slice(0, options.limit);

            emit(
                `Found ${stocks.length} ${options.index.toUpperCase()} component(s); processing ${selected.length}.`,
            );

            if (options.dryRun) {
                for (const stock of selected) {
                    emit(
                        `${stock.name}\t${stock.slug}\t${known[stock.slug] ?? "resolve"}`,
                    );
                }
                return;
            }

            const resolved: Array<{
                symbol: string;
                name: string;
                slug: string;
            }> = [];
            const warnings: string[] = [];

            for (let index = 0; index < selected.length; index += 1) {
                const stock = selected[index];
                const knownSymbol = known[stock.slug];
                emit(
                    `[${index + 1}/${selected.length}] ${stock.name} (${stock.slug})`,
                );

                if (knownSymbol !== undefined) {
                    resolved.push({
                        symbol: knownSymbol,
                        name: stock.name,
                        slug: stock.slug,
                    });
                    emit(`  known ticker ${knownSymbol}`);
                    continue;
                }

                try {
                    const metadata = await openHistoricalPage(
                        page,
                        stock.slug,
                        {
                            retries: options.retries,
                            verbose,
                        },
                    );
                    resolved.push({
                        symbol: metadata.ticker,
                        name: stock.name,
                        slug: stock.slug,
                    });
                    emit(`  resolved ticker ${metadata.ticker}`);
                } catch (cause) {
                    const message =
                        cause instanceof Error ? cause.message : String(cause);
                    warnings.push(`${stock.slug}: ${message}`);
                    warn(`${stock.slug}: could not resolve ticker — ${message}`);
                }

                if (index < selected.length - 1 && options.delayMs > 0) {
                    await sleep(options.delayMs);
                }
            }

            const payload = {
                index: options.index,
                source: COMPONENTS_URLS[options.index],
                generatedAt: new Date().toISOString(),
                stocks: resolved,
                warnings,
            };

            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
            } else {
                for (const stock of resolved) {
                    log(`${stock.symbol}\t${stock.name}\t${stock.slug}`);
                }
                for (const warning of warnings) {
                    warn(warning);
                }
            }
        } finally {
            await browser.close().catch(() => undefined);
        }

        return;
    }

    if (!options.dryRun) {
        requireSavedAuth(authFile);
    }

    const { browser, context } = await launchBrowser({
        headless: options.headless ?? true,
        chromiumPath,
        authFile: hasSavedAuth(authFile) ? authFile : null,
        verbose: options.verbose,
    });

    try {
        const page = await context.newPage();
        const stocks = await loadComponents(page, {
            retries: options.retries,
            verbose: options.verbose,
        });

        log(`Found ${stocks.length} EGX100 component(s).`);

        await runDownload({
            cli: options,
            page,
            stocks,
            outputDir,
        });

        // Refresh the stored cookies after a successful run so normal cookie
        // rotation does not force another manual login too soon.
        if (!options.dryRun) {
            await saveStorageState(context, authFile);
        }
    } finally {
        await browser.close().catch(() => undefined);
    }
}

main().catch((cause: unknown) => {
    error(cause instanceof Error ? cause.message : String(cause));

    if (
        cause instanceof Error &&
        cause.stack &&
        process.env.EGX_DEBUG === "1"
    ) {
        process.stderr.write(`${cause.stack}\n`);
    }

    process.exitCode = 1;
});
