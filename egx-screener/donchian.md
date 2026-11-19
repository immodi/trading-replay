# Donchian Daily Checklist — EGX30

One line per check. If a gate fails, skip the stock. If the entry does not trigger, do nothing.

**The whole decision in one line:** Pass all five gates → today's close is a new 20-day high → rank → size at the next open → set the 7.5% stop → exit on the 10-day low, the stop, or 20 sessions.

## 1. Before you start

- [ ] Use completed daily bars, not intraday bars.
- [ ] Make the decision after the EGX close, using today's finished bar.
- [ ] Trade only the 30 names in the EGX30 universe.
- [ ] Assume the entry fills at the next open, not at today's close.
- [ ] Recalculate the stop and share count from the actual next open.

## 2. Inputs you need

- [ ] Prior high = the highest close of the previous 19 sessions.
- [ ] 20-day high = the highest close of the last 20 sessions, including today.
- [ ] 10-day low = the lowest close of the previous 10 sessions.
- [ ] ATR14 = 14-period Wilder average true range.
- [ ] Average volume 20 = the average volume of the last 20 sessions.
- [ ] Median traded value 20 = the median of `close × volume` over the last 20 sessions.
- [ ] RS60 = `close / close 60 sessions ago − 1`.
- [ ] SMA50 = the average of the last 50 closes.

## 3. Eligibility gates — all five must pass

- [ ] **H — History:** the stock has at least 60 daily bars.
- [ ] **F — Fresh:** today's daily bar exists.
- [ ] **V — Volume:** today's volume is greater than zero.
- [ ] **P — Price:** today's close is at least 1.00 EGP.
- [ ] **L — Liquidity:** the 20-day median traded value is at least 2,000,000 EGP.
- [ ] If any gate fails, mark the stock FILTERED and skip it.

## 4. Entry trigger — the Donchian rule

- [ ] Enter only if today's close is greater than or equal to the prior high.
- [ ] Equivalent: today's close is the highest close of the last 20 sessions.
- [ ] Use the close, not the intraday high, the open, or a moving-average cross.
- [ ] If today's close is below the prior high, mark the stock NO SIGNAL and do nothing.

## 5. If more than three signals — rank them

- [ ] Prefer the strongest breakout: `(close − prior high) / ATR14`, higher is better.
- [ ] Prefer higher volume than the 20-day average volume.
- [ ] Prefer stronger 60-day relative strength (RS60).
- [ ] Prefer a close above a rising 50-day SMA.
- [ ] Prefer lower ATR% (less volatile), all else equal.
- [ ] Take at most three new names per day.
- [ ] Skip names you already hold.
- [ ] The tool's exact weights: 0.50 breakout, 0.20 volume, 0.20 RS60, 0.10 trend, −0.30 ATR%.

## 6. Size at the next open

- [ ] Fill price = the actual next open.
- [ ] Stop loss = fill × (1 − 7.5%).
- [ ] Risk budget = equity × 1%.
- [ ] Commission = 2 EGP + 0.1% of notional, per executed order, per side.
- [ ] Round-trip fixed fees = 2 × 2 = 4 EGP.
- [ ] Fee per share = 2 × fill × 0.1%.
- [ ] Risk shares = floor((risk budget − 4) / (stop distance + fee per share)).
- [ ] Notional cap = floor(1,000,000 / fill).
- [ ] Cash cap = floor((equity − 2) / (fill × 1.001)).
- [ ] Shares = the smallest of the risk, notional, and cash caps.
- [ ] If shares = 0, skip the trade.
- [ ] If round-trip fees exceed 25% of the risk budget, the trade is fee-dominated; consider skipping it.

## 7. Place and manage

- [ ] Buy at the next open, or as close to it as possible.
- [ ] Set the stop immediately after the fill.
- [ ] There is no fixed take-profit.
- [ ] Exit if the close is below the previous 10-session low.
- [ ] Exit if the stop is hit.
- [ ] Exit after 20 sessions, even if neither exit price was hit.
- [ ] Do not widen the stop and do not average down.

## 8. Worked example — EFIH, 2026-11-19

| Check | EFIH value | Result |
| --- | --- | --- |
| History ≥ 60 bars | 83 | Pass |
| Fresh session | 2026-11-19 | Pass |
| Volume > 0 | 3,630,000 | Pass |
| Close ≥ 1.00 EGP | 25.53 | Pass |
| 20-day median traded value ≥ 2,000,000 | 47,310,900 | Pass |
| Close ≥ prior 19-session high | 25.53 ≥ 25.00 | Pass — entry |
| 10-day low (exit trigger) | 23.50 | — |
| Reference stop (7.5% below close) | 23.62 | — |
| Reference size at 100,000 EGP | 506 shares / 12,918 EGP | Fees 29.84 EGP (3.0% of risk) |
| Reference size at 1,000 EGP | 3 shares / 77 EGP | Fees 4.15 EGP (41.5% of risk) — fee-dominated |

- [ ] Buy at the next open; the reference close is 25.53.
- [ ] Recalculate the stop from the actual fill; the reference stop is 23.62.
- [ ] Exit if the close breaks 23.50, the stop is hit, or 20 sessions pass.
- [ ] At 1,000 EGP with 2 EGP + 0.1% fees, the break-even move is 5.42%; consider skipping the trade.

## 9. Skip the trade if…

- [ ] The stock is not in EGX30.
- [ ] Today's bar is missing or stale.
- [ ] Any of the five gates fails.
- [ ] Today's close is below the prior 19-session high.
- [ ] You already hold the stock.
- [ ] Round-trip fees exceed 25% of the risk budget and you are not deliberately accepting the drag.
- [ ] The stock opens limit-up and you cannot get a fill; do not chase.

## 10. Common mistakes

- [ ] Buying because the price is "near" the prior high instead of at or above it.
- [ ] Using the intraday high instead of the daily close.
- [ ] Ignoring the liquidity gate because the chart looks good.
- [ ] Forgetting the fixed 2 EGP per order, especially at small equity.
- [ ] Using a fixed take-profit that the strategy does not have.
- [ ] Holding past 20 sessions because the position is still open.
- [ ] Using a stop based on today's close after filling at a different next open.

> Note: the research runner's 10-day-low exit condition was effectively inactive because its window included the current bar; this checklist follows the intended rule used by the screener.
