import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** tools/egx100-downloader */
export const PROJECT_DIR = path.resolve(moduleDir, "..");
/** Repository root that contains data/ and tools/. */
export const REPO_ROOT = path.resolve(PROJECT_DIR, "..", "..");

export const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, "data", "egx100");
export const DEFAULT_AUTH_FILE = path.join(PROJECT_DIR, ".auth", "investing.json");
export const DOWNLOAD_DIR = path.join(PROJECT_DIR, ".downloads");
export const CACHE_DIR = path.join(PROJECT_DIR, ".cache");

export const COMPONENTS_URLS = {
    egx100: "https://www.investing.com/indices/egx-100-ewi-components",
    egx30: "https://www.investing.com/indices/egx30-components",
} as const;

export type IndexKey = keyof typeof COMPONENTS_URLS;

export const HOME_URL = "https://www.investing.com/";

export const REQUEST_DELAY_MS = 1500;
export const PAGE_TIMEOUT_MS = 60_000;
export const DOWNLOAD_TIMEOUT_MS = 45_000;

export function resolvePath(value: string | null, fallback: string): string {
    return value === null ? fallback : path.resolve(process.cwd(), value);
}
