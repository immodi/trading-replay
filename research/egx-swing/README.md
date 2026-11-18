# EGX30 Portfolio Swing Research

TypeScript research runner driven by the repo's backtesting engine
(`src/backtesting/portfolio.ts`). No Python simulation is used.

## Capital model

| Setting | Value |
| --- | ---: |
| Starting capital | **10,000 EGP** |
| Monthly top-up | **10,000 EGP** |
| Max order notional | **1,000,000 EGP** |
| Risk per trade | **1% of equity** (hard cap 2%) |
| Max hold | **20 sessions** |
| Costs | **0.3% per side** |
| Personal cash | **3.33% of each winning trade** |
| Idle cash | **1% monthly, compounded** |

- Profits compound in the shared portfolio.
- Top-ups happen at the first session of each new month, including catch-up
  deposits when an entire month has no sessions.
- One position per stock; unlimited concurrent positions across EGX30, subject
  to cash and the 1M per-order cap.
- Entry size = `min(1% risk size, cash-constrained size, 1M notional)`.
- **Account risk is capped at 2% per trade** by the engine; the default research
  run uses 1%. The fixed 7.5% figure is the **price distance to the stop**, not
  7.5% of account equity.
- 3.33% of each winning trade's net profit is moved to personal cash.
- Idle cash earns 1% monthly, credited before each monthly top-up.

## Data

- `data/egx30/` contains 30 EGX30 stock files copied from the EGX100 download.
- Mapping: `egx30_constituents.json`.
- Full window: **2010 → latest available**.
- Rolling study: **10-year windows with annual starts** (7 windows).
- Long-only, daily bars, decisions at close, fills at next open.
- Protective stops are intraday; a gap through the stop fills at the open.
- Indicator history is computed on the full series before each window; only
  trading is constrained to the window.

## Strategies

- T1 Donchian breakout — 20-day close high / 10-day close low
- T2 Pullback — close > SMA50 and SMA50 rising; EMA20 dip-then-recover
- T3 EMA10/EMA30 crossover
- R1 Bollinger(20, 2σ) reversion
- R2 RSI(14) < 30 and RSI(2) < 10 variants
- R3 bottom 20% of the 20-day high-low range, exit at midpoint or top
- ADX regime filter: on and off
- Stops: 2 × ATR(14) and fixed 7.5%

## Run

```bash
pnpm research:egx
pnpm research:egx:tune
```

Type-check:

```bash
pnpm exec tsc --noEmit -p research/egx-swing/tsconfig.json
```

Outputs go to `research/egx-swing/results/`:

```text
full_period_per_strategy.csv
six_year_windows.csv
six_year_average.csv
tuning_full.csv
tuning_six_year_windows.csv
tuning_six_year_average.csv
tuning_summary.md
per_stock.csv
trades.csv
equity_curves/
summary.md
summary.html
```

## Results

### Full dataset, 2010 → 2026

Best full-period portfolio: **T1 Donchian, no regime filter, 7.5% stop**

| Metric | Value |
| --- | ---: |
| Final trading equity | 33,882,173 EGP |
| Personal cash withdrawn | 2,667,867 EGP |
| Idle-cash interest | 6,256,358 EGP |
| Contributions | 2,030,000 EGP |
| CAGR | **25.41%** |
| Max drawdown | 43.44% |
| Trades | 2,421 |
| Win rate | 42.7% |
| Profit factor | 1.55 |

Full-period buy-and-hold DCA benchmark: **17.96% CAGR**, 61.1% max drawdown.

### Average 10-year window

Across 7 rolling ten-year windows:

| Strategy | Avg CAGR | Median CAGR | Avg Max DD | Avg Win rate | Avg PF | Avg Expectancy | Beat B&H |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **T1 Donchian, off, 7.5%** | **34.17%** | **33.67%** | **40.28%** | 41.3% | **1.46** | **4,426 EGP** | **100%** |
| T2 Pullback, off, 7.5% | 18.05% | 17.70% | 22.34% | 32.3% | 1.27 | 1,260 EGP | 85.7% |
| T3 EMA cross, off, 7.5% | 17.58% | 16.12% | 42.04% | 36.4% | 1.32 | 1,487 EGP | 85.7% |
| T2 Pullback, off, ATR | 17.25% | 17.04% | 20.85% | 32.5% | 1.32 | 1,455 EGP | 71.4% |
| T3 EMA cross, off, ATR | 16.87% | 14.72% | 43.57% | 36.2% | 1.36 | 1,664 EGP | 42.9% |

Average 10-year buy-and-hold benchmark: **16.35% CAGR**, 55.86% average max
drawdown.

### Stop and risk tuning

`pnpm research:egx:tune` tests account risk at **0.5 / 1 / 1.5 / 2%** with stops
at **ATR 2× / 3× / 4×** and **fixed 5% / 7.5% / 10%**.

Best average ten-year result remains:

- **T1 Donchian, no regime, 1% account risk, fixed 7.5% price stop**
- Avg CAGR **34.17%**, median 33.67%, avg drawdown 40.28%

The 7.5% is not account risk. With a 7.5%-wide price stop and 1% account risk,
position size is roughly 13% of equity. Raising risk to 2% did **not** improve
T1; it increased drawdown and made the compounding path less stable. No
configuration is allowed above the 2% account-risk cap.

**Conclusion:** T1 Donchian is the only strategy that clearly survives the
full-history and rolling-window tests. It beats the DCA benchmark in **7 of 7**
ten-year windows, with roughly 18 points of extra average CAGR and lower average
drawdown. T2/T3 are positive but closer to the benchmark; range strategies are
mostly negative after costs.

## Caveats

- Current EGX30 membership creates survivorship bias.
- One position per stock; no partial fills, borrow, taxes, or dividends.
- Stops and next-open fills are bar-based, not tick-based.
- Overlapping 10-year windows are not independent samples.
- Profit factor can be infinite when there are no losing trades.
