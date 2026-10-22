# TradeReplay

A browser-based **bar replay and backtesting tool** for futures. Upload your own
1-minute OHLCV history, step through it at up to 100×, replay it into higher
timeframes, and practise entries and exits with market/stop orders, bracket
take-profit & stop-loss, and live P/L — entirely client-side.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/license-not%20specified-lightgrey)

## Features

- **Source management** — add one or more datasets by describing the instrument
  (symbol, point value) and choosing a raw JSON file; select a stored source to
  open it, or delete it again. Datasets are kept locally in the browser and can
  be swapped instantly.
- **Candle replay engine** — play forward/backward through history, 0.25×–100× speed, restart, and go-to-latest.
- **Multi-timeframe** — aggregate the raw 1-minute series into 1m / 3m / 5m / 15m / 1h / 5h / 1D on the fly.
- **Trading** — long/short entries; market and stop orders from a chart right-click menu; optional **bracket** (stop-loss / take-profit) with a toggle; live P/L (net of per-side commission) and close-all.
- **Trading session** — completed trades are collected for the active source
  with a summary (trade count, net P/L, total commissions) and a reviewable
  list; remove individual trades or **export the session as JSON** at any time.
  Sessions, open orders, replay position, timeframe, indicators and trading
  preferences are saved in the browser and restored automatically, per source.
- **Indicators** — VWAP (session-resetting), EMA, and SMA, each toggleable with a configurable colour/period.
- **Date selection** — jump to any date in the dataset; earlier candles load as aggregated history.
- **Pluggable data sources** — instruments are described by configs, so adding a dataset doesn't touch the loader.
- **Client-side only** — no backend, no accounts; your datasets never leave the browser.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript |
| Build | Vite 8 (React Compiler via Babel) |
| Styling | Tailwind CSS 4 |
| Charts | [lightweight-charts](https://github.com/tradingview/lightweight-charts) 5 via `lightweight-charts-react-components` |
| Storage | OPFS for datasets, localStorage for sessions and settings |
| Lint | Oxlint |

## Getting started

### Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/)
- A browser with OPFS support (current Chrome, Edge, Firefox, or Safari)

### Install & run

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

On first load you land on the **Sources** screen (not the chart). Add a dataset
there — see [Raw data format](#raw-data-format) for what the file must contain —
then select it from **Stored sources** to open the replay chart.

### Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server (HMR) |
| `pnpm build` | Production build to `dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm lint` | Run Oxlint |
| `pnpm convert-data` | Convert the raw Databento CSV into an upload-ready `data/mnq-1m.json` |

## Data sources

All data is managed from the **Sources** screen:

- **Add a source** — enter a **Symbol** (used as the instrument label and to
  derive its id), a **Point value** (dollars per index point per contract, used
  for P/L), a **Commission** (dollars per contract **per side**; a completed
  trade therefore costs `commission × 2 × quantity`), and pick a raw JSON file.
- **Stored sources** — every uploaded dataset is listed by symbol and file name.
  Click one to open it in the replay chart, or **Delete** to remove it.

Files are written to the browser's **Origin Private File System (OPFS)** along
with a small `<file>.meta.json` sidecar holding the source config
(`id`, `symbol`, `pointValue`, `commission`, `fileName`). This means:

- Nothing is uploaded to a server — the data stays on your machine.
- Storage is **per browser profile and origin**, so datasets are not shared
  between browsers and disappear if you clear site data.
- Reloading the page keeps your sources; the same file name overwrites an
  existing source.

## Raw data format

A source file is a single JSON document: an **array of 1-minute OHLCV bars**,
sorted oldest → newest. This is exactly the shape the app reads and the shape
`pnpm convert-data` writes.

```json
[
  {
    "time": 1625961600,
    "open": 14950.25,
    "high": 14960.0,
    "low": 14945.5,
    "close": 14958.75,
    "volume": 1234
  },
  {
    "time": 1625961660,
    "open": 14958.75,
    "high": 14970.0,
    "low": 14955.0,
    "close": 14966.5,
    "volume": 876
  }
]
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `time` | `number` | yes | Bar open time as a **Unix timestamp in seconds** (UTC), e.g. `1625961600`. Do not use milliseconds. |
| `open` | `number` | yes | Open price. |
| `high` | `number` | yes | High price. |
| `low` | `number` | yes | Low price. |
| `close` | `number` | yes | Close price. |
| `volume` | `number` | yes | Traded volume for the bar. |

Rules the loader relies on:

- The **top level must be an array** — not wrapped in an object or under a key.
- Bars must be **chronological** (ascending `time`, no need to be gap-free).
  The first and last bars define the dataset's date range, and day/history
  queries assume ordering.
- One row per minute; larger timeframes (3m, 5m, …) are aggregated at runtime.
  Timestamps should be minute-aligned.
- The array must contain **at least one bar**, otherwise the source is treated
  as empty.
- Extra fields are ignored; only the six above are read.

### Generating the file from a CSV

The included converter reads a Databento GLBX MDP3 1-minute OHLCV CSV and emits
this JSON:

1. Put `data/glbx-mdp3-<start>-<end>.ohlcv-1m.csv` in `data/`.
2. Run `pnpm convert-data` to produce `data/mnq-1m.json`.
3. Upload that file from the **Sources** screen.

For each timestamp the converter keeps the contract row with the highest volume
(a continuous front-month series). Both the raw CSV and the generated JSON are
large and **not committed**. The output intentionally lives in `data/` rather
than `public/`: Vite copies everything in `public/` into `dist/`, and static
hosts reject oversized assets (Cloudflare Pages caps files at 25 MiB).

## Project structure

```
src/
  components/
    chart/        # lightweight-charts wrapper + replay/trading overlay
    source/       # upload / select / delete datasets (OPFS-backed)
    toolbar/      # replay, speed, timeframe, trading and indicator controls
  constants/      # speeds, timeframes, colours
  data/
    opfs.ts       # Origin Private File System read/write helpers
    sources/      # pluggable candle sources (generic factory + MNQ config)
  hooks/          # replay engine, trade engine, session tracking, data loading, indicators
  indicators/     # VWAP, EMA, SMA implementations
  types/          # shared domain types
  utils/          # candle aggregation helpers
scripts/
  convertRawData.mjs   # CSV -> JSON data pipeline
```

## How it works

- **Sources** — `App` shows the source manager until a config is selected, then
  renders the chart for that config. `opfs.ts` reads/writes dataset files and
  their `.meta.json` sidecars; `createCandleSource` turns a config into a
  queryable dataset (`loadDay`, `getHistory`, `getRange`) over the raw JSON.
- **Replay** — `useReplay` holds the source 1-minute candles and a cache of
  snapshots. Each tick advances a pointer, aggregating minutes into the active
  timeframe; the snapshot cache makes rewinding O(1).
- **Trading** — `useTrade` tracks positions and, on each new price, fills stop
  orders on a price *cross* (not merely being beyond the level), then evaluates
  take-profit / stop-loss for open positions. Its maths live in
  `utils/calculatePositionPL.ts`, shared with the session.
- **Session** — `useTradingSession` records each completed position once into an
  in‑memory list (independent of `Reset`/date changes), sums it up, and exports
  it as JSON via `buildSessionExport` + `downloadJson`. Nothing is written to
  storage, so the export is the only durable copy.
- **Indicators** — recomputed from the current replay slice, so they follow the
  replay rather than the full dataset.

## Deployment

The app is a static Vite build, so any static host works. This repo includes a
**Cloudflare Pages** configuration (`wrangler.toml`, `.nvmrc`):

- **Dashboard** — connect the repository, set the build command to
  `pnpm build`, the output directory to `dist`, and set `NODE_VERSION=22`
  (the `.nvmrc` file is also read automatically).
- **CLI** — `pnpm build && pnpm dlx wrangler pages deploy dist --project-name trade-replay`.

`public/_redirects` adds the SPA fallback. Change `name` in `wrangler.toml` if
the `trade-replay.pages.dev` subdomain is already taken.

> **Netlify note:** `*.netlify.app` edge IPs are blocked by some ISPs (notably in
> Egypt), so the site can time out for visitors even when the deploy is healthy.
> A VPN or a different host is required in that case.

## Docker

```bash
docker build -t tradereplay .
docker run -p 8080:80 tradereplay
```

Or with Compose (set `TRADEREPLAY_PORT` to change the host port, default `8081`):

```bash
docker compose up -d --build
```

The image builds a static bundle and serves it with nginx. Datasets are not
baked into the image — they are uploaded in the browser and stored in OPFS — so
the same build works for any user.

## Roadmap

See [`TODO`](./TODO) — session persistence (LocalStorage / IndexedDB), session
export to CSV, restore previous session on startup, and basic performance
statistics.
