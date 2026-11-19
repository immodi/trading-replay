import type { IndexKey } from "./paths.ts";

export type RunMode = "full" | "append" | "today";

export type CliOptions = {
    command: "login" | "components" | "download" | "universe" | "help";
    mode: RunMode;
    index: IndexKey;
    json: boolean;
    knownFile: string | null;
    symbols: string[];
    days: number | null;
    limit: number | null;
    outputDir: string | null;
    authFile: string | null;
    chromiumPath: string | null;
    headless: boolean | null;
    loginWaitFile: string | null;
    from: string | null;
    to: string | null;
    delayMs: number;
    retries: number;
    createMissing: boolean;
    dryRun: boolean;
    verbose: boolean;
};

const COMMANDS = new Set(["login", "components", "download", "universe"]);

function requireValue(args: string[], index: number, flag: string): string {
    const value = args[index];
    if (value === undefined || value.startsWith("--")) {
        throw new Error(`${flag} requires a value.`);
    }
    return value;
}

function positiveInt(value: string, flag: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${flag} must be a non-negative integer.`);
    }
    return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
    const [commandArg, ...args] = argv;
    let command: CliOptions["command"] = "help";

    if (commandArg !== undefined && commandArg !== "--help" && commandArg !== "-h") {
        if (!COMMANDS.has(commandArg)) {
            throw new Error(`Unknown command "${commandArg}".`);
        }
        command = commandArg as CliOptions["command"];
    }

    const options: CliOptions = {
        command,
        mode: "full",
        index: "egx100",
        json: false,
        knownFile: null,
        symbols: [],
        days: null,
        limit: null,
        outputDir: null,
        authFile: null,
        chromiumPath: null,
        headless: null,
        loginWaitFile: null,
        from: null,
        to: null,
        delayMs: 1500,
        retries: 2,
        createMissing: false,
        dryRun: false,
        verbose: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        switch (arg) {
            case "--mode": {
                const value = requireValue(args, ++index, arg);
                if (value !== "full" && value !== "append" && value !== "today") {
                    throw new Error("--mode must be full, append, or today.");
                }
                options.mode = value;
                break;
            }
            case "--days":
                options.days = positiveInt(requireValue(args, ++index, arg), arg);
                if (options.days < 1) {
                    throw new Error("--days must be at least 1.");
                }
                break;
            case "--index": {
                const value = requireValue(args, ++index, arg);
                if (value !== "egx30" && value !== "egx100") {
                    throw new Error("--index must be egx30 or egx100.");
                }
                options.index = value;
                break;
            }
            case "--json":
                options.json = true;
                break;
            case "--known":
                options.knownFile = requireValue(args, ++index, arg);
                break;
            case "--symbols": {
                const value = requireValue(args, ++index, arg);
                options.symbols = value
                    .split(",")
                    .map((symbol) => symbol.trim())
                    .filter(Boolean);
                break;
            }
            case "--limit":
                options.limit = positiveInt(requireValue(args, ++index, arg), arg);
                break;
            case "--output":
                options.outputDir = requireValue(args, ++index, arg);
                break;
            case "--auth":
                options.authFile = requireValue(args, ++index, arg);
                break;
            case "--chromium":
                options.chromiumPath = requireValue(args, ++index, arg);
                break;
            case "--wait-file":
                options.loginWaitFile = requireValue(args, ++index, arg);
                break;
            case "--from":
                options.from = requireValue(args, ++index, arg);
                break;
            case "--to":
                options.to = requireValue(args, ++index, arg);
                break;
            case "--delay":
                options.delayMs = positiveInt(requireValue(args, ++index, arg), arg);
                break;
            case "--retries":
                options.retries = positiveInt(requireValue(args, ++index, arg), arg);
                break;
            case "--create-missing":
                options.createMissing = true;
                break;
            case "--dry-run":
                options.dryRun = true;
                break;
            case "--headful":
                options.headless = false;
                break;
            case "--headless":
                options.headless = true;
                break;
            case "--verbose":
                options.verbose = true;
                break;
            case "--help":
            case "-h":
                options.command = "help";
                break;
            default:
                throw new Error(`Unknown option "${arg}".`);
        }
    }

    return options;
}

export const HELP = `
EGX100 daily OHLCV downloader (Investing.com + Chromium)

Usage:
  pnpm auth
  pnpm components
  pnpm download [options]
  pnpm download:append [options]
  pnpm download:today [options]
  pnpm universe [options]

Run from tools/egx100-downloader.

Commands:
  login        Open Chromium, sign in manually, save the session state.
  components   Print one index component list without downloading data.
  download     Download daily history for every component.
  universe     Resolve the live component list with Investing.com tickers.

Options:
  --mode full|append|today
                       full (default) overwrites; append merges new days;
                       today fetches a fresh window ending today and overwrites.
  --days N             today mode: fetch the last N calendar days (includes today).
  --index egx30|egx100 Universe/components index (default egx100).
  --json               universe: print one JSON document to stdout.
  --known FILE         universe: JSON {slug: symbol} map to skip page loads.
  --symbols A,B        Only process matching ticker/name/slug values.
  --limit N            Stop after N components (useful for testing).
  --output DIR         Output directory (default: <repo>/data/egx100).
  --auth FILE          Saved storage-state path.
  --chromium PATH      Chromium executable (default: auto-detect).
  --wait-file FILE     login: wait for a marker file instead of Enter.
  --from YYYY-MM-DD    Override start date (full mode).
  --to YYYY-MM-DD      Override end date.
  --delay MS           Delay between stocks (default: 1500).
  --retries N          Retries per stock (default: 2).
  --create-missing     Append mode: create a new file instead of failing.
  --dry-run            Resolve/list stocks but do not download.
  --headful            Show the browser (login is always headful).
  --headless           Force headless downloads.
  --verbose            Show more browser/debug output.
  -h, --help           Show this help.
`.trim();
