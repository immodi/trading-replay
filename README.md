# TradeReplay

A browser-based **bar replay and backtesting tool** for futures. Step through historical 1-minute candles at up to 100×, replay them into higher timeframes, and practise entries and exits with market/stop orders, bracket take-profit & stop-loss, and live P/L — entirely client-side.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/license-not%20specified-lightgrey)

## Features

- **Candle replay engine** — play forward/backward through history, 0.25×–100× speed, restart, and go-to-latest.
- **Multi-timeframe** — aggregate the raw 1-minute series into 1m / 3m / 5m / 15m / 1h / 5h / 1D on the fly.
- **Trading** — long/short entries; market and stop orders from a chart right-click menu; optional **bracket** (stop-loss / take-profit) with a toggle; live P/L and close-all.
- **Indicators** — VWAP (session-resetting), EMA, and SMA, each toggleable with a configurable colour/period.
- **Date selection** — jump to any date in the dataset; earlier candles load as aggregated history.
- **Pluggable data sources** — instruments are described by configs, so adding a dataset doesn't touch the loader.
- **Client-side only** — no backend, no accounts; data is a static JSON file.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript |
| Build | Vite 8 (React Compiler via Babel) |
| Styling | Tailwind CSS 4 |
| Charts | [lightweight-charts](https://github.com/tradingview/lightweight-charts) 5 via `lightweight-charts-react-components` |
| Lint | Oxlint |

## Getting started

### Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/)

### Install & run

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

### Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server (HMR) |
| `pnpm build` | Production build to `dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm lint` | Run Oxlint |
| `pnpm convert-data` | Convert the raw CSV into `public/mnq-1m.json` |

## Data

The app streams `/mnq-1m.json` from `public/`. Both that file and the raw CSV are **large and not committed**, so you need to provide your own:

1. Put a Databento GLBX MDP3 1-minute OHLCV CSV at
   `data/glbx-mdp3-<start>-<end>.ohlcv-1m.csv`.
2. Run `pnpm convert-data` to generate `public/mnq-1m.json`.

For each timestamp the converter keeps the contract row with the highest volume
(a continuous front-month series) and writes a compact
`{ time, open, high, low, close, volume }[]` array.

> Without the data file the app sits on the **“Loading historical data…”** screen.

## Project structure

```
src/
  components/
    chart/        # lightweight-charts wrapper + replay/trading overlay
    toolbar/      # replay, speed, timeframe, trading and indicator controls
  constants/      # speeds, timeframes, colours
  data/
    sources/      # pluggable candle sources (generic factory + MNQ config)
  hooks/          # replay engine, trade engine, data loading, indicators
  indicators/     # VWAP, EMA, SMA implementations
  types/          # shared domain types
  utils/          # candle aggregation helpers
scripts/
  convertRawData.mjs   # CSV -> JSON data pipeline
```

## How it works

- **Replay** — `useReplay` holds the source 1-minute candles and a cache of
  snapshots. Each tick advances a pointer, aggregating minutes into the active
  timeframe; the snapshot cache makes rewinding O(1).
- **Trading** — `useTrade` tracks positions and, on each new price, fills stop
  orders on a price *cross* (not merely being beyond the level), then evaluates
  take-profit / stop-loss for open positions.
- **Indicators** — recomputed from the current replay slice, so they follow the
  replay rather than the full dataset.

## Docker

```bash
docker build -t tradereplay .
docker run -p 8080:80 tradereplay
```

The image builds a static bundle and serves it with nginx. The data JSON is
gitignored, so add it to `public/` (or mount it) before building.

## Roadmap

See [`TODO`](./TODO) — session persistence (LocalStorage / IndexedDB), session
export to CSV, restore previous session on startup, and basic performance
statistics.
