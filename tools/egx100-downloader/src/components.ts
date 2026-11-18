import type { Page } from "playwright-core";

import { COMPONENTS_URL, PAGE_TIMEOUT_MS } from "./paths.ts";
import { log, retryLabel, warn } from "./log.ts";
import type { ComponentStock } from "./types.ts";

const EQUITY_PATH = /^\/equities\/[^/]+\/?$/;

export async function loadComponents(
    page: Page,
    options: { retries: number; verbose: boolean },
): Promise<ComponentStock[]> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= options.retries; attempt += 1) {
        try {
            if (options.verbose) {
                log(`Loading components page${retryLabel(attempt, options.retries + 1)}…`);
            }

            await page.goto(COMPONENTS_URL, {
                waitUntil: "domcontentloaded",
                timeout: PAGE_TIMEOUT_MS,
            });

            await page.waitForFunction(
                () => {
                    const table = document.querySelector("table");
                    return table !== null && table.querySelectorAll("tbody tr").length > 0;
                },
                undefined,
                { timeout: PAGE_TIMEOUT_MS },
            );

            // The component table is virtualised slightly after first paint on
            // some runs; give it a moment to settle.
            await page.waitForTimeout(1000);

            const stocks = await page.evaluate((equityPathSource) => {
                const equityPath = new RegExp(equityPathSource);
                const table = document.querySelector("table");
                if (!table) return [];

                const result: ComponentStock[] = [];
                const seen = new Set<string>();

                for (const row of table.querySelectorAll("tbody tr")) {
                    const links = [...row.querySelectorAll("a[href]")];
                    const link = links.find((candidate) => {
                        try {
                            const url = new URL(
                                (candidate as HTMLAnchorElement).href,
                                location.href,
                            );
                            return (
                                url.hostname.includes("investing.com") &&
                                equityPath.test(url.pathname)
                            );
                        } catch {
                            return false;
                        }
                    }) as HTMLAnchorElement | undefined;

                    if (!link) continue;

                    const url = new URL(link.href, location.href);
                    const slug = decodeURIComponent(
                        url.pathname.replace(/^\/equities\//, "").replace(/\/$/, ""),
                    );
                    if (slug === "" || seen.has(slug)) continue;

                    seen.add(slug);
                    result.push({
                        name:
                            link.title.trim() ||
                            link.textContent?.trim() ||
                            slug,
                        slug,
                        url: url.toString(),
                    });
                }

                return result;
            }, EQUITY_PATH.source);

            if (stocks.length === 0) {
                throw new Error("The EGX100 components table contained no stock links.");
            }

            return stocks;
        } catch (error) {
            lastError = error;
            if (attempt < options.retries) {
                const waitMs = 2000 * (attempt + 1);
                warn(
                    `Components page failed: ${error instanceof Error ? error.message : String(error)}. Retrying in ${waitMs}ms…`,
                );
                await page.waitForTimeout(waitMs);
            }
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Could not load the EGX100 components page.");
}
