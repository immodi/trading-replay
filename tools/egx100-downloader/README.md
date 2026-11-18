# EGX100 daily history downloader

A standalone Chromium automation subproject that signs in to Investing.com,
reads the EGX100 component list, downloads each stock's daily historical CSV,
and converts it into the TradeReplay stock format.

## What it produces

```text
data/egx100/
  CCAP-1d.json        # app-compatible array of daily OHLCV bars
  COMI-1d.json
  …
  manifest.json       # symbol/name/file/date range + app source settings
```

Each `<TICKER>-1d.json` is ready to upload from TradeReplay's **Data Sources**
screen as:

- Market: **Stocks**
- Data interval: **Daily bars**
- Currency: **EGP**
- Point value: fixed at **1** (stocks calculate P/L in the source currency)
- Commission: `0` by default

Raw CSVs are cached in `.cache/csv/` for inspection.

## CSV format identified from Investing.com

The live download produced:

```csv
"Date","Price","Open","High","Low","Vol.","Change %"
"11/18/2026","6.060","6.250","6.300","6.050","36.44M","-3.04%"
```

- Close is the `Price` column.
- Dates are **MM/DD/YYYY** (`mdy`).
- Volume uses `K/M/B/T` suffixes.
- Rows are newest-first.
- A malformed row from Investing.com is skipped with a warning. Example:
  `05/07/2013 | 0.000 | 3.470 | 3.540 | 3.460 | 3.07M | -100.00%`

Parsing uses the `csv-parse` library for delimiter/quoting correctness, then
explicit header, date-order, and volume-notation detection. There is no regex
in the CSV parser. The detected format is printed for every stock during a run.

## Install

```bash
cd tools/egx100-downloader
pnpm install
```

This uses `playwright-core` with the system Chromium, so it does **not**
download another browser. Chromium is auto-detected from common locations, or
pass `--chromium /path/to/chromium` / set `CHROMIUM_PATH`.

## 1. Sign in once and save the session

```bash
pnpm auth
```

A visible Chromium window opens. Sign in to Investing.com there, then press
Enter in the terminal. The session (cookies + localStorage) is saved to:

```text
tools/egx100-downloader/.auth/investing.json
```

That file is gitignored. Downloads reuse it automatically. If Investing.com
expires the session, run `pnpm auth` again.

## 2. Inspect the component list

```bash
pnpm components
```

Prints all 101 EGX100 components as `Name<TAB>investing-slug`. This does not
require a saved session.

## 3. Download full history

```bash
pnpm download
```

For every component it:

1. Opens `/equities/<slug>-historical-data`.
2. Reads the ticker from the page's JSON-LD (e.g. `Qalaa` → `CCAP`).
3. Sets the date range from the selector's earliest available date
   (`1970-01-01`) through today.
4. Clicks **Apply**.
5. Clicks **Download** and saves the CSV.
6. Parses the CSV, normalizes dates to UTC midnight, and writes
   `data/egx100/<TICKER>-1d.json`.
7. Updates `manifest.json` after each stock so an interrupted run keeps its
   progress.

Useful options:

```bash
# Test with two stocks first
pnpm download --limit 2 --verbose

# One stock, by ticker (after it exists in manifest) or name/slug
pnpm download --symbols CCAP
pnpm download --symbols citadel-capita

# Show the browser instead of headless Chromium
pnpm download --headful --limit 2 --verbose

# Custom output path
pnpm download --output /tmp/egx100
```

## 4. Append new dates only

```bash
pnpm download:append
```

Append mode reads the last date already in each `<TICKER>-1d.json`, requests
only from the next day through today, downloads the partial CSV, merges it with
the existing bars, sorts, and deduplicates by UTC date.

If a stock has no existing file, append fails for that stock unless you pass:

```bash
pnpm download:append --create-missing
```

If the file is already current, the stock is reported as **up to date** and no
download is attempted.

## Commands and options

```text
pnpm auth
pnpm components
pnpm download [options]
pnpm download:append [options]
pnpm test
pnpm typecheck
```

```text
--mode full|append   full (default) overwrites; append merges new days
--symbols A,B        only matching ticker/name/slug values
--limit N            stop after N components
--output DIR         output directory (default: <repo>/data/egx100)
--auth FILE          saved storage-state path
--chromium PATH      Chromium executable
--from YYYY-MM-DD    override start date (full mode)
--to YYYY-MM-DD      override end date
--delay MS           delay between stocks (default: 1500)
--retries N          retries per stock (default: 2)
--create-missing     append mode: allow missing output files
--dry-run            list matching stocks without downloading
--headful            show Chromium
--headless           force headless downloads
--verbose            browser/debug output
```

## Notes and limitations

- **Investing.com requires a signed-in session for CSV export.** Without one,
  the site opens its auth popup and the tool stops with a “run pnpm auth”
  message.
- The workflow is sequential by design to avoid hammering the site and getting
  rate-limited. Increase `--delay` if you see failures.
- **Full-history start date:** the date selector's minimum is `1970-01-01`;
  Investing.com returns the actual first available bar, which may be years
  later. The manifest records the real first/last dates.
- **Investing.com caps CSV exports at 5,000 rows.** When a full range hits that
  cap, the downloader continues automatically from the last received bar in
  ten-year chunks and merges the results. This is why a long-history stock may
  show more than 5,000 bars in its final JSON.
- **Exact date-range matching:** the tool waits for the history response whose
  `start-date`/`end-date` match the requested range before clicking Download.
  This prevents accidentally downloading the site's default ~24-bar range.
- Investing.com can redesign the page. The selectors used are:
  - components: first `<table>` and its `/equities/<slug>` links
  - historical rows: first `<table>`
  - date range: hidden `input[type=date]` fields after clicking the range box
  - download: visible `Download` span inside `div.cursor-pointer`
  - ticker: JSON-LD `Corporation.tickersymbol`
- CSV column order is handled by header names, with a fallback for
  `Date,Price,Open,High,Low,Vol.` and a semicolon/ISO-date fallback for tests.
- Duplicate dates keep the incoming (newer) row. This makes append idempotent.
