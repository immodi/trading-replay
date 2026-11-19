# EGX Daily Screener

A small Python + single-page web side project that answers one question after
the EGX close:

> Which stocks pass the strategy's entry rule today, and which are the best
> candidates for tomorrow's open?

It is intentionally separate from the React app and from the main `data/`
directory. Python owns a per-strategy local data folder, and the only external
dependency is the repository's existing Node downloader.

## How it fits together

```text
Investing.com
    │  (Node downloader, today mode)
    ▼
egx-screener/data/<strategy>/*.json     ← fresh window, overwritten each run
    │
    ▼
Python: indicators → strategy → eligibility filters → rank → reference size
    │
    ├── CLI:  screen.py
    └── Web:  server.py  →  web/index.html
```

The strategy and filter rules are documented in **[STRATEGY.md](STRATEGY.md)**.
That document references the exact Python functions. For a manual, one-line
checklist you can use without the tool, see **[donchian.md](donchian.md)**.

## Requirements

- Python 3.10+ (standard library only; no pip install)
- Node.js 22+ and pnpm
- The downloader's dependencies and an Investing.com session:

```bash
cd tools/egx100-downloader
pnpm install
pnpm auth          # sign in once; saves .auth/investing.json
```

## Run the web page

```bash
python3 egx-screener/server.py
# open http://127.0.0.1:8787
```

If the strategy has no local snapshot yet, the page shows a **Refresh today**
button. Refreshing shells out to the Node downloader, waits for the window to
finish, then renders the screen. The server never refreshes on its own; a page
load only reads the local snapshot.

The page is organized around four questions:

| Question | Where the answer is |
| --- | --- |
| What is selected? | **Orders for next open** at the top: one card per selected name with rank, entry, stop, shares, risk, and exit plan. |
| Did a specific stock pass? | **Universe checklist**: five gate chips (H/F/V/P/L) per row, tabs, symbol search, and a detail panel with the actual value, threshold, and reason for every gate. |
| What is the desired price? | The entry is the **next open**; the cards show today's close as a reference. Type the actual open into **Actual fill** and the stop and share count recalculate. |
| What is the SL / TP? | **Stop loss** is 7.5% below the fill. **There is no fixed TP**; the exit plan shows the structural exit (10-day close low for Donchian), the stop, and the 20-session time stop. |

The page also lets you:

- switch between registered strategies;
- set your reference equity (default 100,000 EGP);
- list already-held symbols so they are excluded from the selected list;
- click any row to see every eligibility gate, its actual value, and the
  strategy's detail values;
- open the strategy document at `/STRATEGY.md`.

## Run the CLI

```bash
# Refresh from Investing.com and screen today's close
python3 egx-screener/screen.py --strategy donchian --refresh

# Screen the existing local snapshot without touching the network
python3 egx-screener/screen.py --strategy donchian

# Machine-readable output
python3 egx-screener/screen.py --strategy donchian --json

# Save a copy under egx-screener/out/
python3 egx-screener/screen.py --strategy donchian --save

# Reference sizing and held symbols
python3 egx-screener/screen.py --strategy donchian --equity 250000 --held COMI,ETEL
```

Useful options:

```text
--strategy KEY     strategy key (default: donchian)
--refresh          run the Node downloader's today mode first
--json             print the full result as JSON
--save             write JSON to egx-screener/out/
--equity N         reference account equity in EGP
--held A,B         symbols already held
--data-dir PATH    override the local data directory (offline/testing)
--date YYYY-MM-DD  expected session date (default: today UTC)
--verbose          pass --verbose to the downloader
```

### Refreshing index names

Index membership changes. The **Refresh names** button fetches the live
Investing.com EGX100 and EGX30 component lists through the Node downloader,
resolves any new ticker through the same Investing.com historical-page
pipeline, and rewrites `universes/egx100.json` and `universes/egx30.json`. It
does **not** fetch bars; use **Refresh today** afterward to fetch the updated
list.

The CLI can update names without fetching bars:

```bash
python3 egx-screener/screen.py --refresh-names
python3 egx-screener/screen.py --refresh-names --refresh
```

The Node command is also usable directly:

```bash
cd tools/egx100-downloader
pnpm universe --index egx30 --json \
  --known ../../egx-screener/universes/egx30.json
```

EGX30 dual-line entries (for example `VLMR` and `VLMRA`) are collapsed to the
primary line when the universe file is written. The universe files and the data
folders are independent: refreshing names does not keep stale price files, and
refreshing data does not rewrite the names.

## Local data and the overwrite policy

Each strategy gets its own folder:

```text
egx-screener/data/donchian/
  ABUK-1d.json
  ...
  manifest.json
```

Every refresh deletes that folder's `*-1d.json` files and `manifest.json` before
running the downloader. There is no append or merge, so a run cannot mix two
different days. The window is `strategy.meta.lookback_days` calendar days,
ending today.

These folders are gitignored. The committed universe definitions live in
`egx-screener/universes/`.

## Configuration

Edit `egx-screener/config.json`:

| Key | Default | Meaning |
| --- | ---: | --- |
| `min_history_bars` | 60 | Minimum daily bars before a stock is eligible |
| `min_price` | 1.0 | Minimum close in EGP |
| `min_median_traded_value_20d` | 2,000,000 | Liquidity floor in EGP |
| `risk_per_trade` | 0.01 | Account risk per trade |
| `max_order_notional` | 1,000,000 | Maximum position notional in EGP |
| `cost_pct_per_side` | 0.001 | Percentage fee per executed order per side |
| `fixed_fee_per_order` | 2 | Fixed broker fee per executed order per side (EGP) |
| `fee_warning_threshold` | 0.25 | Warn when round-trip fees exceed this share of the risk budget |
| `equity` | 100,000 | Reference equity for sizing |
| `max_new_per_day` | 3 | Maximum selected candidates |
| `max_positions` | 12 | Concurrent-position cap used with `--held` |
| `ranking_weights` | see file | Cross-sectional factor weights |

Strategy-specific parameters (lookback window, stop, max hold, universe) live in
`strategies/<key>.py` under `StrategyMeta`.

### Fees

The live default is the EGX commission model:

```text
commission per executed order = 2 EGP + 0.1% of the order notional
```

The fixed and percentage components are added together for each side. The
screener reserves both sides' costs inside the 1% risk budget, so the
worst-case loss including fees stays within the risk limit. The research
baseline was **0.3% per side and no fixed fee**; set `cost_pct_per_side = 0.003`
and `fixed_fee_per_order = 0` to reproduce it.

At 1,000 EGP equity the risk budget is only 10 EGP. With the EGX default,
round-trip fees are about **41.5% of that budget** and the break-even move is
5.42%. The page shows the fee drag and raises a warning; the CLI adds `Fees`
and `Fee/Risk` columns. At 100,000 EGP the same fees are about 3% of the risk
budget. See `STRATEGY.md` for the worked example.

## Tests

```bash
python3 -m unittest discover -s egx-screener/tests -v
```

The tests use synthetic bars and a temporary data directory, so they do not
need the downloader, network access, or the main project's `data/` folder.

## Adding a strategy

See [STRATEGY.md §9](STRATEGY.md#9-adding-another-strategy). In short: add a
module under `strategies/`, implement `evaluate` and `exit_signal`, register it,
and add it to the builtin import list in `core/strategy.py`. `ema_cross.py` is a
complete second example.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Downloader dependencies are not installed` | `cd tools/egx100-downloader && pnpm install` |
| `Downloader failed ... pnpm auth` | Run `cd tools/egx100-downloader && pnpm auth` |
| `No EGX session data for <today>` | Run after the EGX close, or pass `--date <latest-session>` deliberately |
| Some symbols show `missing` | The downloader had no rows for them; check the downloader output |
| Some symbols show `stale` | They did not trade in the current session; they are excluded from selection |

## Scope and safety

- Binds to `127.0.0.1` by default. There is no authentication; do not expose it.
- Research tooling only. It does not place orders and is not investment advice.
- The next open is unknown when the screen runs. Every stop and share count is
  a reference value derived from today's close.
