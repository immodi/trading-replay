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
import { runLogin } from "./login.ts";
import {
    DEFAULT_AUTH_FILE,
    DEFAULT_OUTPUT_DIR,
    resolvePath,
} from "./paths.ts";
import { error, log } from "./log.ts";

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
            });

            log(`${stocks.length} EGX100 component(s):`);
            for (const stock of stocks) {
                log(`${stock.name}\t${stock.slug}`);
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
