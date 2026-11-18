import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
    launchBrowser,
    resolveChromiumPath,
    saveStorageState,
} from "./browser.ts";
import { HOME_URL } from "./paths.ts";
import { log } from "./log.ts";

const WAIT_FILE_TIMEOUT_MS = 30 * 60 * 1_000;

async function waitForMarker(fileName: string): Promise<void> {
    fs.rmSync(fileName, { force: true });

    const deadline = Date.now() + WAIT_FILE_TIMEOUT_MS;

    while (Date.now() < deadline) {
        if (fs.existsSync(fileName)) {
            fs.rmSync(fileName, { force: true });
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(
        `Timed out waiting for login marker ${fileName}. Run "pnpm auth" again.`,
    );
}

export async function runLogin(options: {
    authFile: string;
    chromiumPath: string | null;
    verbose: boolean;
    waitFile: string | null;
}): Promise<void> {
    if (!input.isTTY && options.waitFile === null) {
        throw new Error(
            "Login needs an interactive terminal, or pass --wait-file FILE to signal completion from another terminal.",
        );
    }

    const chromiumPath = resolveChromiumPath(options.chromiumPath);
    log(`Chromium: ${chromiumPath}`);
    log(`Session will be saved to: ${options.authFile}`);

    const { browser, context } = await launchBrowser({
        headless: false,
        chromiumPath,
        // Do not load an old session during login; it would hide the sign-in
        // state and make the saved result ambiguous.
        authFile: null,
        verbose: options.verbose,
    });

    const page = await context.newPage();

    try {
        await page.goto(HOME_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
        });
        await page.waitForTimeout(2000);

        log("");
        log("A Chromium window is open.");
        log("1. Sign in to Investing.com in that window.");
        log("2. Wait until the signed-in account menu is visible.");
        log("3. Confirm you are done; the session will then be saved.");
        log("");

        if (options.waitFile !== null) {
            log(`Waiting for marker file: ${options.waitFile}`);
            await waitForMarker(options.waitFile);
        } else {
            const rl = readline.createInterface({ input, output });

            try {
                await rl.question("Press Enter when you are signed in… ");
            } finally {
                rl.close();
            }
        }

        const cookies = await context.cookies();
        const investingCookies = cookies.filter((cookie) =>
            cookie.domain.includes("investing.com"),
        );

        if (investingCookies.length === 0) {
            throw new Error(
                "No Investing.com cookies were found. Did the sign-in complete?",
            );
        }

        await saveStorageState(context, options.authFile);

        log("");
        log(`Saved ${investingCookies.length} Investing.com cookie(s).`);
        log(`Session file: ${options.authFile}`);
        log("You can now run: pnpm download --mode full");
    } finally {
        await browser.close().catch(() => undefined);
    }
}
