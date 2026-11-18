import fs from "node:fs";
import path from "node:path";
import type { Download, Page } from "playwright-core";

import { DOWNLOAD_TIMEOUT_MS, PAGE_TIMEOUT_MS } from "./paths.ts";
import { log, retryLabel, warn } from "./log.ts";
import type { StockMetadata } from "./types.ts";

const DATE_RANGE_CLASS = "div.flex.flex-1.items-center.gap-3\\.5";
const DATE_TEXT_PATTERN =
    /^\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}$/;

export class SessionExpiredError extends Error {
    constructor(message = "Investing.com session is not signed in or has expired.") {
        super(message);
        this.name = "SessionExpiredError";
    }
}

function historicalUrl(slug: string): string {
    return `https://www.investing.com/equities/${encodeURIComponent(slug)}-historical-data`;
}

async function waitForHistoricalTable(page: Page): Promise<void> {
    await page.waitForFunction(
        () => {
            const table = document.querySelector("table");
            return table !== null && table.querySelectorAll("tbody tr").length > 0;
        },
        undefined,
        { timeout: PAGE_TIMEOUT_MS },
    );
}

async function clickDateRange(page: Page): Promise<void> {
    try {
        await page.locator(DATE_RANGE_CLASS).first().dispatchEvent("click");
        return;
    } catch {
        // Fall through to a text-based lookup for redesigns.
    }

    await page.evaluate((patternSource) => {
        const pattern = new RegExp(patternSource);
        const divs = [...document.querySelectorAll("div")];
        const textNode = divs.find(
            (element) =>
                element.children.length === 0 &&
                pattern.test((element.textContent ?? "").trim()),
        );
        const container = textNode?.closest("div.flex");
        (container as HTMLElement | null)?.click();
    }, DATE_TEXT_PATTERN.source);
}

async function readDateBounds(
    page: Page,
): Promise<{ min: string; max: string } | null> {
    const inputs = page.locator("input[type=date]");
    if ((await inputs.count()) < 2) return null;

    const min = await inputs.nth(0).getAttribute("min");
    const max = await inputs.nth(1).getAttribute("max");

    return {
        min: min ?? "1970-01-01",
        max: max ?? new Date().toISOString().slice(0, 10),
    };
}

export async function openHistoricalPage(
    page: Page,
    slug: string,
    options: { retries: number; verbose: boolean },
): Promise<StockMetadata> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= options.retries; attempt += 1) {
        try {
            const url = historicalUrl(slug);
            if (options.verbose) {
                log(`Opening ${url}${retryLabel(attempt, options.retries + 1)}…`);
            }

            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: PAGE_TIMEOUT_MS,
            });
            await waitForHistoricalTable(page);
            await page.waitForTimeout(700);

            const identity = await page.evaluate(() => {
                let ticker = "";
                let legalName = "";
                const scripts = [
                    ...document.querySelectorAll('script[type="application/ld+json"]'),
                ];

                for (const script of scripts) {
                    try {
                        const parsed = JSON.parse(script.textContent ?? "");
                        const entries = Array.isArray(parsed) ? parsed : [parsed];

                        for (const entry of entries) {
                            if (
                                entry &&
                                typeof entry === "object" &&
                                entry["@type"] === "Corporation"
                            ) {
                                if (
                                    typeof entry.tickersymbol === "string" &&
                                    entry.tickersymbol.trim() !== ""
                                ) {
                                    ticker = entry.tickersymbol.trim();
                                }
                                if (
                                    typeof entry.legalname === "string" &&
                                    entry.legalname.trim() !== ""
                                ) {
                                    legalName = entry.legalname.trim();
                                }
                            }
                        }
                    } catch {
                        // Ignore unrelated or malformed JSON-LD.
                    }
                }

                const heading = document.querySelector("h1")?.textContent?.trim() ?? "";
                const headingMatch = /^(.*?)\s*\(([A-Z0-9][A-Z0-9._-]*)\)\s*$/.exec(
                    heading,
                );

                if (ticker === "" && headingMatch) ticker = headingMatch[2];
                if (legalName === "" && headingMatch) legalName = headingMatch[1];

                return {
                    ticker,
                    name: legalName || heading.split("(")[0].trim(),
                };
            });

            const ticker =
                identity.ticker.trim() ||
                slug
                    .toUpperCase()
                    .replace(/[^A-Z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "");

            if (ticker === "") {
                throw new Error(`Could not determine a ticker for ${slug}.`);
            }

            return {
                slug,
                name: identity.name || slug,
                ticker,
                firstDate: null,
                lastDate: null,
                rows: 0,
            };
        } catch (error) {
            lastError = error;
            if (attempt < options.retries) {
                const waitMs = 2500 * (attempt + 1);
                warn(
                    `${slug}: historical page failed (${error instanceof Error ? error.message : String(error)}). Retrying in ${waitMs}ms…`,
                );
                await page.waitForTimeout(waitMs);
            }
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error(`Could not open the historical page for ${slug}.`);
}

async function ensureDateRangeOpen(page: Page): Promise<void> {
    if ((await page.locator("input[type=date]").count()) >= 2) return;
    await clickDateRange(page);
    await page.waitForTimeout(300);
}

/** Read the visible date selector bounds. */
export async function readFirstAndLastAvailableDates(
    page: Page,
): Promise<{ min: string; max: string }> {
    await ensureDateRangeOpen(page);

    const bounds = await readDateBounds(page);
    if (bounds === null) {
        throw new Error("Could not find the historical-data date inputs.");
    }

    return bounds;
}

export async function applyDateRange(
    page: Page,
    startDate: string,
    endDate: string,
    options: { verbose: boolean },
): Promise<number> {
    await ensureDateRangeOpen(page);

    const inputs = page.locator("input[type=date]");
    if ((await inputs.count()) < 2) {
        throw new Error("Could not find the historical-data date inputs.");
    }

    await inputs.nth(0).fill(startDate);
    await inputs.nth(1).fill(endDate);
    await page.waitForTimeout(300);

    const responsePromise = page.waitForResponse(
        (response) => {
            if (
                !response.url().includes("/api/financialdata/historical/") ||
                response.request().method() !== "GET" ||
                response.status() !== 200
            ) {
                return false;
            }

            try {
                const url = new URL(response.url());
                return (
                    url.searchParams.get("start-date") === startDate &&
                    url.searchParams.get("end-date") === endDate
                );
            } catch {
                return false;
            }
        },
        { timeout: 60_000 },
    );

    await page.getByText("Apply", { exact: true }).last().dispatchEvent("click");

    try {
        await responsePromise;
    } catch {
        throw new Error(
            `Timed out waiting for the ${startDate} → ${endDate} history response.`,
        );
    }

    await page.waitForTimeout(1500);

    const rows = await page.locator("table").first().locator("tbody tr").count();
    if (options.verbose) {
        log(`  range ${startDate} → ${endDate}: ${rows} table row(s)`);
    }

    return rows;
}

/**
 * Click the site's Download control and save the browser download. Using the
 * DOM click avoids ad/overlay layers intercepting the pointer.
 */
export async function downloadCsv(
    page: Page,
    destination: string,
    options: { verbose: boolean },
): Promise<void> {
    fs.mkdirSync(path.dirname(destination), { recursive: true });

    let captured: Download | null = null;
    const onDownload = (download: Download) => {
        captured = download;
    };

    page.on("download", onDownload);

    let csvBody: Buffer | null = null;
    const onResponse = (response: import("playwright-core").Response) => {
        const headers = response.headers();
        const contentType = (headers["content-type"] ?? "").toLowerCase();
        const disposition = (headers["content-disposition"] ?? "").toLowerCase();

        if (
            !contentType.includes("csv") &&
            !disposition.includes("attachment")
        ) {
            return;
        }

        void response
            .body()
            .then((body) => {
                if (body.length > 0) csvBody = body;
            })
            .catch(() => undefined);
    };

    page.on("response", onResponse);

    const context = page.context();
    const onPage = (popup: Page) => {
        popup.on("download", onDownload);
        popup.on("response", onResponse);
    };
    context.on("page", onPage);

    try {
        // The date-range popover can still be open after Apply and can sit
        // over the Download control. Escape closes it without navigating.
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(250);

        const clicked = await page.evaluate(() => {
            const spans = [...document.querySelectorAll("span")].filter(
                (span) => (span.textContent ?? "").trim() === "Download",
            );

            for (const span of spans) {
                const control = span.closest("div.cursor-pointer") as
                    | HTMLElement
                    | null;
                if (!control) continue;

                const style = window.getComputedStyle(control);
                if (style.display === "none" || style.visibility === "hidden") {
                    continue;
                }

                control.click();
                return true;
            }

            return false;
        });

        if (!clicked) {
            throw new Error("Could not find a visible Download control.");
        }

        const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;

        while (Date.now() < deadline) {
            if (captured !== null || csvBody !== null) break;

            const authVisible = await page
                .locator('[class*="auth_popup"]')
                .last()
                .isVisible()
                .catch(() => false);

            if (authVisible) {
                if (options.verbose) log("  auth popup detected");
                throw new SessionExpiredError();
            }

            await page.waitForTimeout(500);
        }

        const body: Buffer | null = csvBody;

        if (captured === null && body === null) {
            throw new Error(
                "The Download control did not produce a file. If you are signed in, Investing.com may require a Pro plan for CSV exports.",
            );
        }

        if (captured !== null) {
            const download: Download = captured;
            await download.saveAs(destination);
        } else if (body !== null) {
            fs.writeFileSync(destination, body);
        }

        const size = fs.statSync(destination).size;
        if (size === 0) {
            throw new Error("Downloaded CSV is empty.");
        }

        if (options.verbose) {
            log(`  saved CSV (${size.toLocaleString()} bytes)`);
        }
    } finally {
        page.off("download", onDownload);
        page.off("response", onResponse);
        context.off("page", onPage);
    }
}
