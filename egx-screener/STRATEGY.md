# EGX Daily Screener — Strategy and Filters

This document is the authoritative description of what the screener evaluates.
Every rule below maps to a Python function so the prose and the code stay in
sync. For the manual, one-line checklist version, see
[donchian.md](donchian.md).

## 1. What the tool answers

> For every stock in the chosen universe, does the latest completed daily close
> pass the strategy's entry rule and all eligibility gates — and if so, how
> should the candidate be ranked and sized for the next open?

It is a **close-of-day screener**, not a portfolio manager. It does not place
orders, track fills, or manage open positions. The `Held` input is only used to
keep already-held symbols out of the "selected" list.

## 2. Data contract

| Item | Rule |
| --- | --- |
| Source | `data/egx100` is **not** read. The tool shells out to `tools/egx100-downloader` in `today` mode. |
| Window | The strategy declares `lookback_days`. For the Donchian breakout that is **120 calendar days**, enough for 60+ sessions, the 50-day SMA, and the 60-day relative-strength lookback. |
| Storage | `egx-screener/data/<strategy-key>/<TICKER>-1d.json` plus a `manifest.json`. |
| Overwrite | Every refresh clears the strategy's local folder first. There is no append or merge; each run is a clean snapshot. |
| Session check | The latest bar date must equal today's UTC date. If it does not (weekend, holiday, expired session), the screen fails with an explicit error. |
| Look-ahead | Only bars whose date is today or earlier are used. The decision is made on today's close; fills are assumed at the next open. |

The bridge is `core/downloader.py::refresh_strategy`. It runs:

```text
pnpm exec tsx src/cli.ts download --mode today \
  --days <lookback_days> \
  --output egx-screener/data/<strategy-key> \
  --symbols <comma-separated Investing.com slugs>
```

The Node side is `tools/egx100-downloader/src/download.ts` (`processStock`, the
`today` branch).

## 3. Universe

A strategy declares a universe: a named key or an explicit symbol list. The
default Donchian breakout strategy uses `egx30`.

| Universe | File | Size |
| --- | --- | --- |
| `egx30` | `universes/egx30.json` | 30 symbols |
| `egx100` | `universes/egx100.json` | 98 symbols |

A strategy points at a named universe or an explicit symbol list by setting
`StrategyMeta.universe`:

```python
universe = "egx30"              # named file: universes/egx30.json
universe = "egx100"             # all EGX100 names
universe = ["COMI"]             # one stock
universe = ["COMI", "ETEL"]     # a custom subset
```

Symbol lists are resolved against `universes/egx100.json`. The strategy owns
this choice; the screener does not hard-code EGX30.

The universe files can be refreshed live from Investing.com. The page's
**Refresh names** action, or `python3 egx-screener/screen.py --refresh-names`,
runs the Node downloader's `universe` command for both indexes; new slugs are
resolved to tickers through the same Investing.com historical-page pipeline the
downloader uses. EGX30 dual-line entries are collapsed to the primary line. The
downloader only fetches the symbols named by the active strategy's universe.

## 4. Donchian Breakout entry

Defined in `strategies/donchian.py::DonchianStrategy.evaluate`.

Let `close[t]` be today's close and `n = 20`.

```text
prior_high_19[t] = max(close[t-19 .. t-1])
entry            = close[t] >= prior_high_19[t]
```

Because the 20-bar window includes today, `close[t] >= prior_high_19[t]` is
exactly "today's close is the highest close of the last 20 sessions". This is
the same condition as the research runner's
`close >= rolling_max(close, 20)`, where the rolling window includes the current
bar.

The breakout strength factor is:

```text
breakout_atr = (close[t] - prior_high_19[t]) / ATR14[t]
```

`prior_high_19` and `ATR14` come from `core/indicators.py::build_indicators`.

### Exit (documented for completeness)

The documented exit is the 10-day closing low:

```text
exit = close[t] < min(close[t-10 .. t-1])
```

`DonchianStrategy.exit_signal` implements that rule. The screener does not use
it, because it only evaluates entries at today's close.

> **Known discrepancy in the research runner:** `research/egx-swing/indicators.ts`
> computes `donchianLow10` over a window that includes the current bar, so its
> exit condition `close < donchianLow10` can never be true. The research Donchian
> results were therefore driven by the 7.5% stop and the 20-session time stop.
> This screener's entry screen is unaffected.

Recommended risk frame, matching the research:

| Setting | Value |
| --- | --- |
| Stop | 7.5% below the fill (`DonchianStrategy.meta.stop_pct`) |
| Maximum hold | 20 sessions (`meta.max_hold_bars`) |
| Fill | Next open |
| Costs | 0.3% per side (`config.json`) |

## 5. Eligibility gates

All gates must pass before a triggered stock is ranked or selected. They are
composed in `core/filters.py::build_filters`; each returns a `FilterResult`
that the UI shows as a pass/fail row with the actual value.

| Gate | Default | Live rule | Code |
| --- | ---: | --- | --- |
| History | 60 bars | `len(bars) >= min_history_bars` | `HistoryFilter` |
| Fresh bar | today | last bar date == session date | `FreshBarFilter` |
| Traded today | volume > 0 | `volume[t] > 0` | `VolumeFilter` |
| Minimum price | 1.00 EGP | `close[t] >= min_price` | `PriceFilter` |
| Liquidity | 2,000,000 EGP | `median(close[i] * volume[i] for i in t-19..t) >= min_median_traded_value_20d` | `LiquidityFilter` |

The liquidity gate is the most important EGX-specific filter. A 20-day median
traded value below the threshold usually means a breakout cannot be filled at a
useful size. Change the threshold in `config.json`; do not bury it in code.

A stock that fails a gate is still shown, with the failed gate and its reason,
so the screen answers "does each stock pass?" rather than hiding the rest.

## 6. Ranking

Only stocks that (a) triggered the strategy and (b) passed every gate are
ranked. The ranker is `core/filters.py::rank_candidates`.

Each factor is converted to a cross-sectional percentile in `[0, 1]` among the
candidates, then combined with weights from `config.json`:

```text
score = Σ(weight_i × percentile_i) / Σ(|weight_i|)
```

| Factor | Definition | Default weight | Direction |
| --- | --- | ---: | --- |
| `breakout_atr` | `(close - prior_high_19) / ATR14` | 0.5 | higher is better (Donchian only) |
| `cross_strength` | `(EMA10 - EMA30) / ATR14` | 0.3 | higher is better (EMA only) |
| `volume_ratio` | `volume[t] / avg_volume_20[t]` | 0.2 | higher is better |
| `rs60` | `close[t] / close[t-60] - 1` | 0.2 | higher is better |
| `trend_flag` | 1 if `close > SMA50` and `SMA50` rising | 0.1 | higher is better |
| `atr_pct` | `ATR14 / close` | -0.3 | lower is better (negative weight) |

A single candidate receives a neutral 0.5 percentile for every factor. Missing
factors are skipped for that candidate and the denominator is renormalized, so
`breakout_atr` is ignored when the active strategy is EMA, and `cross_strength`
is ignored when it is Donchian. The score is a relative ordering device, not a
probability or an expected return.

## 7. Selection and reference sizing

Selection is `core/screener.py::run_screen` plus `core/sizing.py::size_position`.

```text
held_set          = symbols supplied in the Held field
available_slots   = max(0, max_positions - len(held_set))
selected_count    = min(max_new_per_day, available_slots)
```

Candidates are taken in descending score order. Held symbols are shown but not
selected. Each candidate gets a reference size. The risk budget is a
**worst-case loss budget including both sides' fees**:

```text
stop_distance    = close * stop_pct
risk_budget      = equity * risk_per_trade
round_trip_fixed = 2 * fixed_fee_per_order
fee_per_share    = 2 * close * cost_pct_per_side
risk_shares      = floor((risk_budget - round_trip_fixed) / (stop_distance + fee_per_share))
notional_shares  = floor(max_order_notional / close)
cash_shares      = floor((equity - fixed_fee_per_order) / (close * (1 + cost_pct_per_side)))
shares           = min(risk_shares, notional_shares, cash_shares)
stop             = close * (1 - stop_pct)
notional         = shares * close
entry_fee        = notional * cost_pct_per_side + fixed_fee_per_order
exit_fee         = same (conservative: the exit notional is at or below entry)
round_trip_fees  = entry_fee + exit_fee
fee_pct_of_risk  = round_trip_fees / risk_budget
breakeven_pct    = round_trip_fees / notional
worst_case_loss  = shares * stop_distance + round_trip_fees
```

This ensures `worst_case_loss <= risk_budget`. If `risk_budget <=
2 * fixed_fee_per_order`, no shares fit and `capped_by = "fees"`.

Defaults: `equity = 100,000 EGP`, `risk_per_trade = 1%`, `stop_pct = 7.5%`,
`max_order_notional = 1,000,000 EGP`, `cost_pct_per_side = 0.1%`,
`fixed_fee_per_order = 2 EGP`, `fee_warning_threshold = 25%`.

The live screener default is the EGX commission model:

```text
commission per executed order = 2 EGP + 0.1% of the order notional
```

The fixed and percentage components are added together per side. The research
baseline was `0.3%` per side and **no fixed fee**; set `cost_pct_per_side =
0.003` and `fixed_fee_per_order = 0` to reproduce the research costs. A fee
warning is raised when `fee_pct_of_risk` exceeds `fee_warning_threshold` or
`breakeven_pct` exceeds the stop percentage.

### Small-account example

At `equity = 1,000 EGP`, the 1% risk budget is only **10 EGP**.

| Fee model | Approx. shares at 25.53 | Notional | Round-trip fees | Fee / risk | Break-even |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.30%/side + 0 EGP/order (research) | 4 | 102 EGP | 0.61 EGP | 6.1% | 0.60% |
| **2 EGP/side + 0.10%/side (EGX default)** | **3** | **77 EGP** | **4.15 EGP** | **41.5%** | **5.42%** |

With the EGX default the break-even move is 5.42%, below the 7.5% stop, but the
fees still consume **41.5% of the 10 EGP risk budget**. The win is heavily
reduced by costs at that size and the page raises a fee warning. At
`equity = 100,000 EGP` the same fee model costs about **3% of the risk budget**
(506 shares, 12,918 EGP notional, 29.84 EGP round-trip fees, 0.23% break-even),
so the fixed component becomes negligible.

**These are reference values at today's close.** The real fill is the next open,
so recalculate the stop and share count from the actual fill before placing an
order.

### Reading an order card

| Field | Meaning |
| --- | --- |
| Entry / desired price | The fill is the **next open**. The strategy has no fixed limit price; the card shows today's close as a reference. |
| Actual fill | Optional. Type the real next-open price and the card recalculates the stop and share count with the same formula. |
| Stop loss (SL) | `fill × (1 − stop_pct)`. The reference stop uses today's close. |
| Take profit (TP) | **None.** The exit plan is the strategy's structural exit (the 10-day close low for Donchian), the stop, or the 20-session time stop. |
| Risk | `equity × risk_per_trade`, including both sides' fees in the worst-case loss. |
| Fees (round trip) | `entry_fee + exit_fee`. Both sides are reserved inside the risk budget. |
| Fee / risk | Round-trip fees as a share of the risk budget. A warning appears when it exceeds `fee_warning_threshold` or when the break-even move exceeds the stop. |
| Break-even move | `round_trip_fees / notional`; the price move needed just to cover costs. |

## 8. Status meanings

> The UI and CLI label a row `SELECTED` when its `selected` flag is true. The
> JSON keeps `status: "signal"` and exposes the selection as `selected: true`,
> so the status describes the screen result while `selected` describes the
> next-open order list.

| Status | Meaning |
| --- | --- |
| `SELECTED` | Triggered, eligible, and inside the top `max_new_per_day` slots. |
| `signal` | Triggered and eligible, but outside the selection cap. |
| `held` | Triggered and eligible, but already in the Held list. |
| `filtered` | Triggered, but failed at least one eligibility gate. |
| `stale` | The stock has no bar for the current session. |
| `no_signal` | Eligible, but today's close did not trigger the strategy. |
| `missing` | No local file was downloaded for this symbol. |

## 9. Adding another strategy

1. Create `strategies/<key>.py`.
2. Implement a class with a `StrategyMeta` and `evaluate` / `exit_signal`.
3. Call `register(YourStrategy())` at import time.
4. Add the import to `core/strategy.py::_load_builtin_strategies`.
5. Declare `lookback_days` (the downloader window) and `universe` (which JSON
   to load).

`strategies/ema_cross.py` is the working second example: a 10/30 EMA crossover
that reuses the same filters, ranker, sizing, and UI.

The screener never calls a concrete strategy directly; it resolves the key
through `core/strategy.py::get_strategy`.

## 10. Assumptions and caveats

- Prices are the raw Investing.com daily closes; the data is **not adjusted**
  for splits or consolidations. A corporate action can create a false 20-day
  high. Treat extreme single-day moves with suspicion.
- The EGX30 universe is the current membership. Historical screening on it has
  survivorship bias.
- The session check uses UTC dates, matching the downloader. Run after the EGX
  close (after roughly 16:00 Africa/Cairo) so today's bar exists.
- The screener is stateless. It does not know your real cash, open positions, or
  fill prices beyond the optional `Held` list and the `Equity` input.
- Investing.com can change its page or require a fresh login. The downloader
  surfaces those failures; re-run `pnpm auth` in `tools/egx100-downloader` if
  needed.
- This is research tooling, not investment advice.
