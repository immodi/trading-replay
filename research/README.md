# Research harness

This folder contains the reproducible research for
[`PROP_STRATEGY_REPORT.md`](../PROP_STRATEGY_REPORT.md). It uses the app's
existing backtest engine; the only engine change is an additive per-bar equity
hook in `src/backtesting/runBacktest.ts` used by the prop simulator.

## Quick start

```bash
# One-time: 1m JSON -> compact binary cache + quality reports
node research/prep-data.mjs

# Optional: deeper audits
node research/audit-data.mjs
node research/roll-audit.mjs

# Run a strategy on one instrument (smoke test)
node --import tsx research/run.ts --strategy orb-15m --symbol mes --tf 15 \
  --start 2021-07-12 --end 2023-12-29 --risk 175

# Run all six, save the equity/trade paths, and simulate the prop eval
node --import tsx research/evaluate.ts --strategy orb-15m --symbol all --tf 15 \
  --start 2021-07-12 --end 2023-12-29 --risk 175 \
  --params '{"openingRangeBars":2,"rewardRisk":3,"stopAtr":1.75,"trendEma":0,"orWidthMinAtr":0,"orWidthMaxAtr":2.25}' \
  --trail intraday --save research/results/final-dev

# Combine the six instruments into one account + funded phase
node --import tsx research/portfolio.ts --dir research/results/final-dev \
  --trail intraday --funded

# Parameter plateau / candidate comparison
node --import tsx research/sweep.ts --strategy orb-15m --symbol mes --tf 15 \
  --start 2021-07-12 --end 2023-12-29 --risk 175 \
  --grid '{"stopAtr":[1.5,1.75,2],"orWidthMaxAtr":[2,2.25,2.5],"rewardRisk":[2.5,3,3.5]}'

node --import tsx research/compare.ts > research/results/candidates.csv
```

## Files

| Path | Role |
| --- | --- |
| `prep-data.mjs` | streams the 1m JSON into `cache/*.bin`, writes coverage/quality stats |
| `audit-data.mjs` | RTH coverage, 5m bucket completeness, big 1m moves |
| `roll-audit.mjs` | reconstructs front-month rolls from the raw CSV and measures splice gaps |
| `lib/data.ts` | binary cache → bars via the app's own `aggregatePackedBars` |
| `lib/session.ts` | DST-aware US Eastern session helpers |
| `lib/prop.ts` | `PropConfig`, intrabar equity marks, rolling-start eval simulation |
| `lib/funded.ts` | funded phase and first-payout simulation |
| `lib/firms.ts` | example firm presets (verify against the real firm) |
| `run.ts` | one strategy/instrument/range, prints summary + yearly PnL |
| `evaluate.ts` | strategy + prop eval, optional `--save` for portfolio |
| `portfolio.ts` | merge instrument paths, aggregate prop/funded results |
| `sweep.ts` | one-instrument parameter grid |
| `compare.ts` | dev/OOS comparison table for all candidate families |
| `verify-strategy.ts` | checks the generic deployable file matches the research module |
| `verify-mnq.ts` | checks the MNQ preset matches the research module at $500 |
| `verify-m2k.ts` | checks the M2K low-risk preset matches the research module |
| `MNQ_PLAN.md` | the practical MNQ-only plan and risk frontier |
| `PERSONAL_500.md` | why a $500 cash account cannot safely trade one micro |
| `LOW_RISK_M2K.md` | the $1k M2K low-risk plan |
| `personal.ts` | fixed-1-contract $ account path, ruin/double bootstrap |
| `deployable/mnq-orb-15m.js` | MNQ-only preset, $500 risk default |
| `deployable/m2k-orb-lowrisk.js` | M2K low-risk preset, $50 cap, 1 contract |
| `strategies/orb-15m.mjs` | the research ORB module (fixed 1 and cash variants also here) |
| `strategies/*.mjs` | candidate modules (self-contained, app API v1) |

## Prop configuration

Every rule is a field in `PropConfig` (`lib/prop.ts`) and can be overridden from
the CLI. The important ones:

| Field | Default | Meaning |
| --- | ---: | --- |
| `startingBalance` | 50,000 | eval starting balance |
| `profitTarget` | 3,000 | pass level |
| `maxTrailingDrawdown` | 2,000 | max trailing drawdown |
| `trailMode` | `intraday` | trail on intraday unrealized highs, EOD close, or static |
| `lockFloorAtStart` | true | stop raising the floor at the starting balance |
| `dailyLossLimit` | null | absolute daily loss that fails the eval |
| `consistencyMaxBestDayPct` | null | best day / total profit cap |
| `timeLimitDays` | 60 | trading days before timeout |
| `passOnIntraday` | true | pass on intraday touch vs EOD only |

CLI examples:

```bash
# EOD trailing drawdown + $1,000 daily loss
node --import tsx research/portfolio.ts --dir research/results/final-dev \
  --trail eod --daily-loss 1000

# Static drawdown
node --import tsx research/portfolio.ts --dir research/results/final-dev --trail static

# Funded phase: 5 winning days >= $200, 90% split, $2k cap
node --import tsx research/portfolio.ts --dir research/results/final-oos \
  --trail intraday --funded --min-win-days 5 --min-win-profit 200 --split 0.9 --payout-cap 2000
```

The `eval` and `funded` fields in `lib/firms.ts` show how to add a preset.

## Modeling choices and caveats

- **Rolls:** the JSON is a raw front-month stitch, not back-adjusted. The
  research strategy uses only same-session RTH levels so roll splices cannot
  enter the signal. Any strategy that uses prior-day prices (gap fade, daily EMA)
  is exposed; quantify it with `roll-audit.mjs`.
- **Intrabar marks:** the prop layer uses the engine's 15m bar high/low and
  separately accounts for trades that closed inside the bar. A tick-level path
  would be more precise; the report includes a close-only sensitivity that
  changed the pass rate by <1 point.
- **Rolling starts overlap.** The pass rate is “probability conditional on
  starting that day,” not a set of independent trials.
- **Costs:** per-side commission and slippage are explicit; `--slippage-ticks`,
  `--commission-mult` stress them.
- **No same-bar fills:** the engine fills at the next bar open; the prop layer
  does not add any optimistic assumption.
- **Deployable strategy:** `../strategies/opening-range-breakout.js`. It was
  frozen before the OOS run; see `results/FROZEN.md` and `FROZEN.sha256`.
- **Result:** the strategy failed out-of-sample. See the main report before
  using it.
