# 50k Prop Evaluation — Intraday Futures Strategy Research

**Bottom line up front:** I built and tested the strategy, the prop-rule simulator, and
the funded-phase model. The best rule-compliant candidate made money in the
development sample and **lost money in the untouched out-of-sample sample
(2024-01-01 → 2026-11-02)**. Its out-of-sample expected value per eval attempt is
**negative (-$73 at $150/eval)**. I do not recommend buying a 50k evaluation with
this strategy. The one pocket that survived out-of-sample is **MNQ-only**, which
your constraints explicitly rule out. The details, the exact rules, and the full
audit are below so you can verify or extend the work.

---

## 1. What is in the repo / what I used

### Engine
- `src/backtesting/runBacktest.ts` — the existing event-driven engine.
- `src/backtesting/aggregateBars.ts` — the app's UTC-bucketed 1m → 5m/15m aggregation.
- `src/backtesting/dataQuality.ts`, `metrics.ts`, `validateStrategy.ts`.
- I added **one additive hook** (`onBarEquity`) to `runBacktest.ts` so the prop
  layer can see the intraday equity path. It does not change engine behaviour;
  all 78 existing tests still pass.

### Data
- `data/{mes,mnq,m2k,mym,mgc,mcl}-1m.json` (one JSON array per instrument).
- Raw GLBX 1m CSV (`data/glbx-mdp3-...csv`) plus the MES/MNQ CSVs.
- I built a compact binary cache (`research/prep-data.mjs` → `research/cache/*.bin`)
  and audited every instrument (`research/audit-data.mjs`, `roll-audit.mjs`).

### Research artifacts
| File | Purpose |
| --- | --- |
| `research/lib/data.ts` | binary cache → engine bars, using the app's aggregation |
| `research/lib/prop.ts` | configurable prop rules, rolling-start eval simulation |
| `research/lib/funded.ts` | funded phase, first-payout simulation |
| `research/lib/firms.ts` | example firm presets (verify with the actual firm) |
| `research/evaluate.ts` | run a strategy on one/all instruments + prop sim |
| `research/portfolio.ts` | combine instrument paths into one account |
| `research/sweep.ts`, `compare.ts` | parameter sweeps and candidate comparison |
| `research/strategies/*.mjs` | candidate strategy modules |
| `strategies/opening-range-breakout.js` | deployable, frozen candidate (git-ignored; mirror below) |
| `research/deployable/opening-range-breakout.js` | tracked mirror, same SHA-256 |
| `research/results/` | all result JSON/CSV, `FROZEN.md`, `FROZEN.sha256` |

---

## 2. Data audit (what the data actually is)

### Coverage and quality

| Symbol | First bar | Last bar | 1m bars | RTH days | Median RTH bars/day | Days < 350 bars | Jumps > 1% (consecutive 1m) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| MES | 2019-05-05 | 2026-11-02 | 2,642,057 | 1,935 | 390 | 65 (3%) | 50 |
| MNQ | 2021-07-11 | 2026-11-02 | 1,883,255 | 1,371 | 390 | 46 (3%) | 49 |
| M2K | 2019-05-05 | 2026-11-10 | 2,520,852 | 1,941 | 390 | 67 (3%) | 134 |
| MYM | 2019-05-05 | 2026-11-10 | 2,587,173 | 1,941 | 390 | 68 (4%) | 55 |
| MGC | 2010-10-03 | 2026-11-10 | 2,593,084 | 2,667 | 389 | 854* | 27 |
| MCL | 2021-07-11 | 2026-11-10 | 1,858,195 | 1,378 | 390 | 44 (3%) | 282 |

\* MGC has an illiquid 2010–2019 history (often 1–90 bars/day). From 2020 onward it
trades ~386 RTH bars/day. The common fully-liquid sample for all six starts
**2021-07-12**, which is why development starts there.

Checked and clean:
- **No duplicate timestamps, no non-increasing timestamps.**
- **No invalid OHLC** (high/low bounds), **no non-finite values, no negative volume.**
- All timestamps are minute-aligned UTC.
- Gaps in the 1m series are overwhelmingly minutes with no trades (normal for
  futures); they are not missing-file gaps. RTH 5m buckets are almost always
  complete: 0.04% partial for MES, 0.00% MNQ, 0.38% M2K, 0.15% MYM.
  MGC/MCL show higher full-history partial rates (8.97%/1.35%) because of thin
  early MGC years and MCL's shorter history; from 2022 onward RTH buckets are
  effectively complete.

### Timezone and sessions
- Timestamps are UTC. US Eastern is computed DST-aware (second Sunday March →
  first Sunday November), so RTH is 13:30–20:00 UTC in summer and 14:30–21:00 UTC
  in winter.
- The app aggregates by UTC-midnight buckets, which aligns exactly with 09:30 ET
  for 5m/15m bars.
- **Holiday problem found and handled:** futures print RTH-like bars on US cash
  market holidays (e.g. Presidents' Day 2022). A naive session filter will trade
  those sessions; the final strategy skips them and exits at 12:45 ET on exchange
  half-days.

### Contract rolls — the biggest data limitation
The converter (`scripts/convertRawData.mjs`) builds a **continuous front-month
series without back-adjustment**. It picks the highest-volume outright contract
per UTC date and rolls forward only. That means the JSON contains raw price
splices at every roll, not a back-adjusted series.

Measured splice gaps (old contract last close → new contract first close):

| Root | Rolls | Median abs gap | p90 | Max |
| --- | ---: | ---: | ---: | ---: |
| MES | 30 | 0.82% | 1.18% | 1.64% |
| MNQ | 21 | 1.00% | 1.33% | 2.20% |
| M2K | 30 | 0.49% | 1.19% | 1.97% |
| MYM | 30 | 0.54% | 1.10% | 1.30% |
| MGC | 65 | 0.82% | 1.67% | 2.04% |
| MCL | 64 | 0.64% | 1.98% | **4.44%** |

MCL rolls **monthly** and is the worst offender (4.4% splice on 2026-09-18;
4.2% on 2026-05-15). MGC rolls roughly every two months. Index micros roll
quarterly.

**Consequences for strategy design:**
- Any rule that references the prior day's close/level (gap fade, prior-day
  high/low, daily EMA on raw closes) is contaminated once per roll. The daily
  EMA variant I tested was hit by this; its OOS result was worse than the
  RTH-only version.
- The frozen strategy deliberately uses **only same-session RTH data** for the
  opening range and ATR, and never references a prior-session price. That makes
  it immune to roll splices.
- ATR true range at the first bar of a session is computed as `high - low`
  (not close-to-close), so even the session-opening gap cannot leak in.
- Overnight gaps are also why all trades are flattened before 16:00 ET.

Other data notes:
- The giant GLBX CSV does **not** contain MES or MNQ; those JSONs were built from
  the separate `data/mes` and `data/mnq` CSVs. Same converter, different windows.
- Data ends 2026-11-02 for MES/MNQ and 2026-11-10 for the others. The OOS test
  uses 2026-11-02 for all so every instrument has the same end date.
- 2026 MCL/MGC have several large 1-minute jumps (up to 5.8%). Some are real
  news moves; some may be roll/print artifacts. The 1-tick slippage assumption
  may be optimistic on those minutes. Doubling slippage is in the stress tests.
- No tick/order-book data. Intrabar path is unknown; the engine's
  stop-first assumption is the conservative choice.

---

## 3. Engine audit — exactly how fills and costs work

From `runBacktest.ts`:
- **Market entries/exits:** filled at the **next bar's open** with adverse
  slippage (`+slip` for longs, `-slip` for shorts). There is no same-bar fill.
- **Stop-loss:** checks the bar's OHLC. If the open is already beyond the stop,
  fills at the open; otherwise at the stop. Adverse slippage applies.
- **Take-profit:** fills exactly at the target, no slippage, no improvement.
- **Both stop and target touched in one bar:** stop is checked first.
- **Entry bar:** brackets can trigger on the entry bar itself.
- **Commission:** `commissionPerSide × 2 × quantity`, charged on the completed
  trade.
- **Slippage:** `slippagePointsPerSide` per entry and per exit/stop; targets are
  exempt. `netPnl = grossPnl - commission`; slippage is embedded in the fills
  (and reported separately as an estimate).
- **Equity:** marked at every bar close; the daily curve is one point per UTC day
  (last bar of the day).
- **Forced close:** positions still open at the end of the test close at the last
  close with slippage. **There is no daily forced close** — the strategy must
  flatten itself.
- **Warm-up:** `onBar` runs on warm-up bars but actions are ignored, so
  indicators can be seeded.
- **Max 1 position per instrument** in all runs; max 100 contracts/entry.

Limitations that matter:
- No native session calendar, holiday calendar, or roll adjustment. The strategy
  implements sessions/holidays; the data is unadjusted, so the strategy must stay
  intraday.
- No partial fills, queue position, or liquidity model. At 1–3 micro contracts
  this is acceptable; at 10+ MCL/MGC contracts it is not.
- The daily equity curve is not enough for a trailing drawdown that marks
  unrealized PnL intraday. I added the `onBarEquity` hook, which reports, per bar:
  equity, realized PnL, open entry commission, open positions, and the
  worst/best mark of those positions at the bar's high/low.
- The prop layer is separate (`research/lib/prop.ts`), so rules are configurable
  and do not contaminate the engine.

---

## 4. Methodology and anti-overfitting plan

**Split**
- Development: **2021-07-12 → 2023-12-29** (639 RTH days). This is the oldest
  common fully-liquid window.
- Out-of-sample: **2024-01-01 → 2026-11-02** (733 RTH days), untouched until the
  design was frozen.
- Frozen design and SHA-256 hashes: `research/results/FROZEN.md` and
  `FROZEN.sha256`.
  - `research/strategies/orb-15m.mjs`: `a6086e73…54165d`
  - `strategies/opening-range-breakout.js`: `4c7ee5de…24f617`
- Walk-forward: yearly results inside both samples, plus a 27-combination
  parameter grid to check plateaus, not to pick a maximum.

**Candidates tested (all same rules across all six instruments):**
1. Opening-range breakout, 15m, fixed R target, optional trend EMA/width filter.
2. Opening-range breakout with ATR trailing stop.
3. Opening-range breakout + daily 50-EMA trend filter.
4. Session-VWAP standard-deviation reversion (2 SD, reversal candle).
5. RSI(2) dip-buy/rally-sell in the direction of a 200 EMA.
6. Donchian 20/10 breakout with 50 EMA filter.
7. Opening-drive momentum (first 30 minutes → next open, hold/target).
8. Opening-dip reversion (moderate down open → buy, hold to close).

**Costs:** $1.25/side for index micros, $1.50/side for MGC/MCL; 1 tick/side
slippage (0.25 MES/MNQ, 0.10 M2K/MGC, 1.0 MYM, 0.01 MCL). Stress: 2 ticks/side,
1.5× commission, one extra bar of entry delay.

**Prop simulation** (default; every field configurable):
- 50,000 start; +3,000 target; 2,000 max trailing drawdown.
- Trailing on **intraday unrealized** PnL by default; alternatives `eod` and
  `static`.
- Floor locks at the starting balance once it reaches it (common firm rule).
- Optional daily loss limit, optional consistency rule.
- Flat by 16:00 ET enforced by the strategy.
- A fresh eval starts on **every trading day**; 60-day time limit.
- Pass on intraday touch by default; EOD-pass is also reported.
- Fail causes: drawdown, daily loss, time, consistency.

**Funded model:** 5 winning days ≥ $200, 90/10 split, $2,000 first-payout cap,
2,000 trailing DD, 60-day limit, consistency optional. Funded starts the day
after the pass at the eval ending balance.

**Important statistical caveat:** rolling daily starts overlap heavily. The pass
rate answers “if I started on a random day,” not “independent attempts.” The
per-horizon probabilities only include starts with enough days remaining.

---

## 5. The frozen strategy (and why it was the best candidate)

**Rules — 15-minute RTH chart:**
1. Session: 09:30–16:00 ET only; no US market holidays.
2. Opening range: high/low of the first **30 minutes** (first two 15m bars).
3. Skip the day if the opening range is wider than **2.25 × ATR(14)**.
4. Enter at the next bar open when a 15m bar closes **above the range high**
   (long) or **below the range low** (short). One trade per day.
5. Stop **1.75 × ATR(14)** from the fill; target **3R**.
6. Flatten on the 15:45 ET bar (12:45 half-days); no entries after 15:00 ET.
7. Risk **$175 per instrument**; quantity = floor(risk / (stop points × point
   value + round-trip commission)), capped at 10 contracts.
8. Trade all six micros independently (one position each).

Why this one: on the dev sample it was the only rule set that was positive on
5/6 instruments with a broad parameter plateau, and it had the best combination
of profit factor and drawdown. It is also hand-tradeable: two levels from the
first 30 minutes, one ATR value, one target.

Deployable file: `strategies/opening-range-breakout.js` (5 parameters:
`stopAtr`, `rewardRisk`, `maxOrWidthAtr`, `riskDollars`, `maxContracts`). The
repo's `.gitignore` ignores `/strategies/` as private local files, so a tracked
mirror is at `research/deployable/opening-range-breakout.js` (same SHA-256).
The research module and the deployable file produce **identical trades** on MES
(verified by `research/verify-strategy.ts`).

### Development performance

| Instrument | Trades | Net PnL | PF | Win% |
| --- | ---: | ---: | ---: | ---: |
| MES | 440 | +$5,107 | 1.18 | 45.5 |
| MNQ | 251 | +$3,903 | 1.25 | 49.8 |
| M2K | 242 | +$4,086 | 1.30 | 50.0 |
| MYM | 378 | +$574 | 1.02 | 43.1 |
| MGC | 342 | +$7,213 | 1.33 | 48.5 |
| MCL | 462 | +$5,072 | 1.15 | 42.4 |
| **All** | **2,115** | **+$25,956** | **1.19** | **45.9** |

Yearly portfolio PnL: 2021 +$6,067, 2022 +$9,428, 2023 +$10,479.
Portfolio daily Sharpe ≈ 1.58, 80% positive months, max daily-close DD $3,268.

### But the edge is concentrated

- Top 50 trades (2.4% of trades) = **89% of net profit**.
- Top 10 days = **56% of net profit**.
- The 3R target hits only 142 times out of 2,115 trades; most wins are
  session-close exits.
- Remove the best 10 days and the dev edge is thin.

That is not automatically bad — trend days pay for chop — but it means the
strategy is a bet on a handful of large-range days, not a smooth coupon.

---

## 6. The out-of-sample result

Same rules, same parameters, same six instruments, one shot on 2024–2026:

| Instrument | Trades | Net PnL | PF | Win% |
| --- | ---: | ---: | ---: | ---: |
| MES | 521 | -$368 | 0.99 | 40.7 |
| MNQ | 192 | **+$4,212** | **1.34** | 47.9 |
| M2K | 331 | -$272 | 0.99 | 45.6 |
| MYM | 351 | -$2,816 | 0.89 | 41.0 |
| MGC | 349 | -$3,323 | 0.86 | 41.5 |
| MCL | 580 | -$6,829 | 0.85 | 39.5 |
| **All** | **2,324** | **-$9,395** | **0.94** | **41.9** |

Portfolio daily mean **-$12.81**, Sharpe **-0.57**.
Yearly: **2024 -$1,170**, **2025 +$1,026**, **2026 -$9,246**.

Only **MNQ** survived (PF 1.25 dev → 1.34 OOS). That is exactly the “MNQ-only”
outcome your constraints call a failed strategy.

### Why it failed
- The opening-range breakout edge is **instrument- and regime-specific**, not a
  universal intraday law. It worked on NQ and (for a while) ES, and failed on
  crude, gold, Dow and Russell micros.
- 2026 was a broad loss year for the strategy across five of six instruments.
  Data quality is not the explanation: 2026 has normal bar counts and *higher*
  volume than 2023.
- The dev sample (2021–2023) was a strong trending/chop mix that suited
  breakouts; 2024–2026 did not.
- Costs matter but are not the cause: with **zero commission and zero slippage**
  the OOS portfolio still loses **-$1,930** across 2,324 trades. The gross edge
  is absent; costs only make it worse.

### Candidate comparison (all six instruments, $175 risk)

| Candidate | Dev net | Dev PF | OOS net | OOS PF |
| --- | ---: | ---: | ---: | ---: |
| ORB 30m + width filter | +$25,956 | 1.19 | -$9,395 | 0.94 |
| ORB + daily 50 EMA | +$15,679 | 1.20 | -$11,823 | 0.89 |
| ORB trailing stop | +$5,951 | 1.02 | -$39,765 | 0.86 |
| VWAP reversion | -$53,053 | 0.74 | -$33,837 | 0.83 |
| Donchian 20/10 | -$7,213 | 0.97 | -$60,387 | 0.81 |
| Open-dip reversion | +$4,015 | 1.04 | -$2,211 | 0.97 |

Only the ORB had a real dev edge; none generalized.

---

## 7. Prop-evaluation simulation

### Development sample (risk $175/instrument)

| Horizon | Pass probability |
| --- | ---: |
| 20 trading days | 10% |
| 30 trading days | 21% |
| 45 trading days | 35% |
| 60 trading days | 39% |

- Median days to pass: **30**; 90th percentile: **47**.
- Fail causes: drawdown 332, time 57.
- Funded phase: 50% reach a payout, median **16 days**; mean payout given paid
  **$1,026**; expected value per eval attempt after the $150 fee:
  `39.1% × $1,026 − $150 = +$251`. These are **inflated by the same dev-period
  edge**; see the OOS line below.

### Out-of-sample (the honest numbers)

| Horizon | Pass probability |
| --- | ---: |
| 20 trading days | 4% |
| 30 trading days | 7% |
| 45 trading days | 12% |
| 60 trading days | 14% |

- Median days to pass: **30**; 90th percentile: **46**.
- Fail causes: drawdown **606**, time 35.
- Funded phase: **35.9%** reach a payout, median 22 days; mean payout given paid
  **$615**.
- **EV per $150 eval attempt: 12.6% × $615 - $150 = -$73.**
- With a static (non-trailing) drawdown the OOS pass rate rises to 17.6%, still
  negative EV. EOD trailing: 13.0%.

### Risk frontier (dev; pass probability by horizon)

| Risk per instrument | P20 | P30 | P45 | P60 | Median days | Interpretation |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| $100 | 0% | 0% | 1% | 3% | 46 | too slow |
| $125 | 0% | 3% | 7% | 21% | 51 | slow |
| $150 | 6% | 15% | 26% | 34% | 34 | balanced |
| $175 | 10% | 21% | 35% | 39% | 30 | best 60-day |
| $200 | 21% | 28% | 30% | 31% | 17 | best ~30-day |
| $250 | 30% | 32% | 32% | 32% | 9 | fast gamble |

The frontier is the central trade-off: **more risk does not create edge, it only
compresses the calendar and increases the chance of hitting the 2k trailing
floor.** At $250, a 9-day median pass sounds great until you see that 64% of
starts fail, mostly by drawdown.

### Prop-rule variants (dev, risk $175)

| Rule | Pass within 60d | Notes |
| --- | ---: | --- |
| Intraday trailing, lock at start | 39.1% | base case |
| Intraday trailing, **no** lock | 34.6% | lock helps |
| EOD trailing, lock | 42.6% | slightly easier |
| Static drawdown | 52.4% | much easier, less common |
| Daily loss $1,000 | 39.1% | failures shift to daily-loss (32) |
| Daily loss $750 | 35.4% | too tight |
| Consistency 40% / 50% | 39.1% | no effect at the pass moment |

On OOS, static is 17.6%, EOD 13.0%, intraday 12.6%. The ranking survives, but
the level does not.

---

## 8. Anti-overfitting / “hunt for your own lies” checklist

What I checked:
- **Look-ahead:** signals use only the completed bar; fills are next open; no
  `history.at()` future access; no same-bar fills. One trade/day, no overnight.
- **Same-bar stop/target:** engine checks stop first if both are touched; stop
  gaps fill at the open. This is conservative.
- **Roll handling:** all signal inputs are same-session RTH; no prior-day price
  levels. ATR first bar uses high-low, not the roll gap. The daily-EMA variant
  *did* use prior closes and was worse, consistent with roll contamination.
- **Sessions/timezone:** DST-aware ET; holidays skipped; half-days flatten at
  12:45 ET. Verified zero overnight trades.
- **Data quality:** no duplicates/bad OHLC/negative volume; gaps are no-trade
  minutes; 2026 volume/bars are normal, so the OOS loss is not a data outage.
- **Costs:** 1 tick/side + $1.25–1.50/side; stress 2 ticks + 1.5× commission;
  one-extra-bar delayed fills. Dev pass rate falls from 39.1% to 30.7% (2× slip),
  32.9% (1.5× commission), 24.1% (delay), 21.8% (all three). The edge is
  cost-sensitive but not cost-killed in dev; OOS is negative regardless.
- **Parameter plateau:** 27 combinations around the chosen values, all positive
  dev mean, pass rates 25–46%. The chosen point is mid-plateau, not the maximum.
  This is still in-sample selection; the OOS is the real test.
- **Concentration:** top 50 trades = 89% of dev net; top 10 days = 56%. Reported
  explicitly; it is a fragility, not a diversified edge.
- **Multiple testing:** I tested 8 strategy families and many parameter
  combinations on dev. The probability of finding a false positive is high. The
  OOS failure is the expected outcome of that search, and it is why I am not
  presenting the dev numbers as achievable.
- **Survivorship:** all six micros still trade; no delisted instruments. The
  sample starts when all six are liquid, which avoids the MGC 2010–2019 trap.
- **2026 anomaly:** checked bar counts, volume, partial buckets, and 1m jumps.
  2026 has the highest MCL/MGC volume of the sample and normal RTH coverage.
  The loss is strategy behaviour, not a broken feed.

What I could not check:
- Tick-level intrabar path (no tick data). The 15m OHLC worst/best marks are a
  bound; a 1m reconstruction would be more precise.
- Real bid/ask spreads and queue. 1 tick/side is a reasonable micro assumption,
  but MCL/MGC can widen.
- Actual firm rule changes. The prop config is a model; verify the current
  contract.

---

## 9. The arithmetic of the goal (why this is hard)

- Target +$3,000 on a $2,000 trailing DD = a **1.5:1 barrier**. Even a zero-edge
  random walk hits +3k before -2k about 40% of the time if given unlimited time;
  costs and the 60-day limit reduce that.
- To pass in **20 trading days** you need about **$150/day net**, i.e.
  **0.86R/day** at $175 risk.
- The tested systems produce roughly **0.05–0.10R per trade**, and the portfolio
  generates ~3–4 trades/day → **0.15–0.40R/day** at best. That is a 40–100 day
  grind, not a 20-day sprint.
- More risk compresses the calendar but raises the probability of a drawdown
  breach. At $250 risk the median pass is 9 days, but 64% of attempts fail,
  usually by drawdown.
- The only way to change this is a genuinely higher-expectancy edge, not more
  contracts, more indicators, or tighter stops.

---

## 10. Recommendation

1. **Do not buy a 50k eval with this strategy.** The OOS expected value is
   negative (-$73 per $150 attempt at risk $175), and the pass probability
   within 60 days is 12.6%, not 39%.
2. If you want to keep the framework, use it to **screen future ideas**:
   development on 2021–2023, OOS 2024–2026, and require a candidate to be
   positive in *both* with the same parameters before risking money.
3. The only consistent pocket is **MNQ-only ORB** (dev +$3.9k PF 1.25; OOS
   +$4.2k PF 1.34). It violates your generic constraint and is a single-market
   bet; I would not build a prop plan on it without a fresh 2027 sample. For
   completeness: at $400 risk per MNQ trade over 2021–2026, the eval pass rate is
   29% within 60 days (61% for 2024 starts, 7% for 2026 starts). It does not
   solve the one-month problem either.
4. If you still want to trade the frozen rules, treat it as **paper trading**
   until the portfolio shows a rolling 3-month PF > 1.1 and a positive
   out-of-sample month. The deployable file and the prop config are ready.
5. The most promising next research directions, given what failed:
   - session-specific strategies for MCL/MGC (their true pit opens are 08:20 /
     09:00 ET, not 09:30);
   - cross-sectional relative strength (trade the strongest/weakest of the six,
     not each independently);
   - volatility/regime filters that can be computed without prior-day price
     levels (e.g. same-session ATR percentile);
   - a proper 1m intrabar equity path for the trailing-DD model;
   - a genuinely fresh holdout (2027) before any live capital.

---

## 11. Reproduce it

```bash
# 1. Build the binary cache and audit (one time)
node research/prep-data.mjs
node research/audit-data.mjs
node research/roll-audit.mjs

# 2. Verify the deployable file matches the research module
node --import tsx research/verify-strategy.ts

# 3. Development run + prop simulation
node --import tsx research/evaluate.ts --strategy orb-15m --symbol all --tf 15 \
  --start 2021-07-12 --end 2023-12-29 --risk 175 \
  --params '{"openingRangeBars":2,"rewardRisk":3,"stopAtr":1.75,"trendEma":0,"orWidthMinAtr":0,"orWidthMaxAtr":2.25}' \
  --trail intraday --save research/results/final-dev

node --import tsx research/portfolio.ts --dir research/results/final-dev \
  --trail intraday --funded

# 4. Out-of-sample (one shot)
node --import tsx research/evaluate.ts --strategy orb-15m --symbol all --tf 15 \
  --start 2024-01-01 --end 2026-11-02 --risk 175 \
  --params '{"openingRangeBars":2,"rewardRisk":3,"stopAtr":1.75,"trendEma":0,"orWidthMinAtr":0,"orWidthMaxAtr":2.25}' \
  --trail intraday --save research/results/final-oos

node --import tsx research/portfolio.ts --dir research/results/final-oos \
  --trail intraday --funded
```

All result files are in `research/results/`. The frozen design and hashes are in
`research/results/FROZEN.md` and `FROZEN.sha256`.
