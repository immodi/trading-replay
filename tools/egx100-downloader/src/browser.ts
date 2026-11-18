import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright-core";

import { DEFAULT_AUTH_FILE } from "./paths.ts";

const USER_AGENT =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

const AD_HOST_PATTERN =
    /(doubleclick|googlesyndication|googleadservices|googletagmanager|google-analytics|taboola|outbrain|3lift|openx|pubmatic|hadronid|qsearch|pbxai|im-apps|gcprivacy|ad\.gt|rubiconproject|amazon-adsystem|criteo|sundaysky|presage|ogury|adx\.opera|rtb\.mx|bidswitch|admatic|cootlogix|voltaxam|trustedstack|everesttech|bluevoox|opera\.com\/pub\/sync)/i;

function chromiumCandidates(): string[] {
    if (process.platform === "win32") {
        return [
            "C:\\Program Files\\Chromium\\Application\\chrome.exe",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ];
    }

    if (process.platform === "darwin") {
        return [
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ];
    }

    return [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/snap/bin/chromium",
    ];
}

export function resolveChromiumPath(override: string | null): string {
    if (override) {
        if (!fs.existsSync(override)) {
            throw new Error(`Chromium executable not found: ${override}`);
        }
        return override;
    }

    if (process.env.CHROMIUM_PATH) {
        if (!fs.existsSync(process.env.CHROMIUM_PATH)) {
            throw new Error(
                `CHROMIUM_PATH points to a missing file: ${process.env.CHROMIUM_PATH}`,
            );
        }
        return process.env.CHROMIUM_PATH;
    }

    const found = chromiumCandidates().find((candidate) => fs.existsSync(candidate));
    if (!found) {
        throw new Error(
            "No Chromium/Chrome executable found. Install Chromium or pass --chromium /path/to/chromium.",
        );
    }

    return found;
}

export type LaunchResult = {
    browser: Browser;
    context: BrowserContext;
};

export async function launchBrowser(options: {
    headless: boolean;
    chromiumPath: string;
    authFile?: string | null;
    verbose?: boolean;
}): Promise<LaunchResult> {
    const authFile = options.authFile ?? DEFAULT_AUTH_FILE;
    const storageState =
        options.authFile === null
            ? undefined
            : fs.existsSync(authFile)
              ? authFile
              : undefined;

    const browser = await chromium.launch({
        headless: options.headless,
        executablePath: options.chromiumPath,
        args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
    });

    const context = await browser.newContext({
        acceptDownloads: true,
        locale: "en-US",
        timezoneId: "Africa/Cairo",
        viewport: { width: 1440, height: 1000 },
        userAgent: USER_AGENT,
        extraHTTPHeaders: {
            "Accept-Language": "en-US,en;q=0.9",
        },
        storageState,
    });

    await blockAds(context, options.verbose === true);

    // tsx/esbuild can inject a `__name(...)` helper into evaluated callbacks.
    // Define it in the page world so Playwright evaluation does not fail.
    await context.addInitScript({
        content:
            "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
    });

    return { browser, context };
}

async function blockAds(context: BrowserContext, verbose: boolean): Promise<void> {
    await context.route("**/*", async (route) => {
        const url = route.request().url();

        if (AD_HOST_PATTERN.test(url)) {
            if (verbose) process.stderr.write(`blocked ${url.slice(0, 160)}\n`);
            await route.abort().catch(() => undefined);
            return;
        }

        await route.continue().catch(() => undefined);
    });
}

export function hasSavedAuth(authFile: string = DEFAULT_AUTH_FILE): boolean {
    return fs.existsSync(authFile);
}

export function requireSavedAuth(authFile: string = DEFAULT_AUTH_FILE): void {
    if (!hasSavedAuth(authFile)) {
        throw new Error(
            `No saved Investing.com session at ${authFile}. Run "pnpm auth" first.`,
        );
    }
}

export async function saveStorageState(
    context: BrowserContext,
    authFile: string = DEFAULT_AUTH_FILE,
): Promise<void> {
    const state = await context.storageState();
    const directory = path.dirname(authFile);
    fs.mkdirSync(directory, { recursive: true });

    const temporary = `${authFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
    fs.renameSync(temporary, authFile);
}
