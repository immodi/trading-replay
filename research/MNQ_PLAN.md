# MNQ-only plan (the one survivor)

This is the practical version of the research, for the decision to trade **MNQ
only**. Read the caveats before buying an evaluation.

## 1. What to trade

**Instrument:** MNQ (Micro E-mini Nasdaq-100), one position at a time.

**Chart:** 15-minute, US regular session only (09:30–16:00 ET).

**Rules (same ORB as the report):**
1. Opening range = high/low of the first 30 minutes (09:30–10:00 ET).
2. Skip the day if the opening range is wider than **2.25 × ATR(14)**.
3. Enter at the next 15m open when a bar closes above the range high (long) or
   below the range low (short). **One trade per day.**
4. Stop **1.75 × ATR(14)** from the fill; target **3R**.
5. Flatten on the 15:45 ET bar (12:45 on exchange half-days). No entries after
   15:00 ET. No US market holidays.
6. Risk **$400 per trade**. Quantity = floor(400 / (stop points × $2 +
   round-trip commission)), capped at 10 contracts. With typical 15m ATR this is
   usually 2–4 MNQ; the observed max at $500 risk was 7 contracts, at $400 it is
   lower.

**Files:**
- Upload **`research/deployable/mnq-orb-15m.js`** — the MNQ preset with
  `riskDollars` already defaulting to 400. It produces exactly the same trades
  as the research module at $400 (verified by `research/verify-mnq.ts`).
- If you use the generic file instead, set `stopAtr = 1.75`,
  `rewardRisk = 3`, `maxOrWidthAtr = 2.25`, `riskDollars = 400`,
  `maxContracts = 10`.

## 2. The risk reality (read this before sizing)

Full sample 2021-07-12 → 2026-11-02, every trading day as an eval start,
60-day limit, 50k / +3k / 2k trailing intraday DD:

| Risk/trade | Share of 2k DD | 30d pass | 60d pass | DD-fail rate | Funded payout | EV / $150 eval |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| $200 | 10% | 0% | <1% | low | — | negative |
| $250 | 12.5% | 0% | 3% | 6% | 72% | **-$139** |
| $300 | 15% | 2% | 10% | 20% | 92% | **-$82** |
| $350 | 17.5% | 7% | 21% | 32% | 65% | **+$64** |
| **$400** | **20%** | **11%** | **29%** | **46%** | **61%** | **+$158** |
| **$500** | **25%** | **19%** | **33%** | **56%** | **58%** | **+$288** |
| $600 | 30% | 24% | 30% | 64% | 38% | +$266 |

The uncomfortable result: **at prudent risk ($200-300, 10-15% of the DD) the
eval is negative EV.** The edge is too small to reach +$3,000 before either the
60-day clock or the $2,000 floor. The only positive-EV rows are $350+ — which
means the account is being sized aggressively by necessity, not by choice.

- $350 is the first positive-EV row, but it is marginal (+$64) and still risks
  17.5% of the DD per trade.
- **$400 is the least-bad compromise**: 29% pass in 60 days, 11% in 30 days,
  +$158 EV, and a 46% drawdown-failure rate. Still aggressive.
- $500 maximizes pass probability and EV, but 56% of attempts fail by drawdown.
  Treat it as a cheap lottery ticket with a 2-3 attempt budget, not a
  risk-managed plan.
- $600 is faster but the funded payout rate collapses to 38%; not recommended.

I also tested a dynamic overlay (risk $500, switch to $250 after a $300-750
drawdown or after +$1,000-2,000 profit). It **lowered** the pass rate to 6-19%
because halving risk near the target makes the last $1,500 too slow. There is no
sizing trick that fixes a thin edge.

**OOS-only (2024–2026) at $400:** 20d 5%, 30d 14%, 45d 26%, **60d 33%**;
funded payout 57.0%, median 22 days, mean payout given paid $1,284,
**EV +$238 per $150 attempt**.

## 3. Funded phase

Defaults modeled: 5 winning days ≥ $200, 90/10 split, $2,000 first-payout cap,
2k trailing DD, 60-day limit.

- Full sample (at $400): **61.0%** of funded accounts reach a payout; median
  **22 days**; mean payout given paid **$1,119**.
- OOS: **57.0%**, median 22 days, mean payout given paid **$1,284**.
- This is conditional on passing the eval. The eval is the bottleneck.

## 4. Attempt policy

- Budget **2–3 evals** (`~$300–450` at $150 each). At $400 risk the cumulative
  chance of at least one pass in 3 monthly 30-day attempts is roughly
  **30%** (11% per attempt). At $500 it is roughly **47–53%** (19–22% per
  attempt). If you let each eval run the full 60 days, the per-attempt pass
  rate is 29–38%.
- **Do not increase risk after a failure.** The eval fee is cheap; a blown
  account is the expensive part.
- If an eval passes, stop trading the eval and move to the funded account. Do
  not immediately buy another eval.
- If the funded account fails before payout, reassess before buying again.

## 5. Firm checklist

Look for a 50k eval with:

- Profit target ~$3,000.
- **Trailing drawdown ~$2,000**, ideally end-of-day or intraday; the result is
  similar for MNQ (32.8% both in the model). Prefer a floor that locks at the
  starting balance.
- **No daily loss limit below ~$1,000**; a tight daily limit cuts the pass rate.
- Allows at least **7 MNQ contracts** (or accept 5 and slightly lower sizing).
- No consistency rule that blocks the first payout; if there is one, 40–50% is
  fine for this strategy.
- Flat by 16:00 ET is compatible (the strategy exits at 15:45).
- Payout terms close to 5 winning days ≥ $200, 90/10, first payout cap ≥ $2,000.

Verify every number on the firm's current page; these rules change.

## 6. The honest caveats

- **The recent regime is weak.** At $400 risk the yearly PnL is:
  2021 +$1,844, 2022 +$2,955, 2023 +$3,247, **2024 +$10,932**,
  **2025 +$1,872**, **2026 −$578**. The last 60 trades are **−$1,863**.
  The 29–33% pass rate is driven by 2021–2024; 2025–2026 are weaker.
- **Trailing performance is not a reliable timing signal.** I tested starting
  an eval after good vs bad 60-trade windows. The worst bucket
  (< −$1,000) had the *highest* pass rate (48.7%), the best bucket (> +$1,000)
  30.7%. That is likely small-sample noise, but it means “wait until it’s hot”
  is not supported. Take the unconditional odds, not a timing rule.
- **A normal losing streak can fail the eval.** Max observed losing streak at
  $400 risk: **8 trades ≈ −$2,189** (average loss $274), just above the $2,000
  DD. This is why 46% of eval starts fail by drawdown even at the reduced size.
- **Single-market risk.** MNQ-only is a bet on one index. A regime change can
  make it flat for a year; 2025–2026 are the warning.
- **Data/model caveats:** raw front-month rolls (not back-adjusted; the
  strategy is RTH-only so it avoids them), 15m OHLC intrabar approximation,
  1 tick/side slippage may be optimistic in fast markets.

## 7. Optional stability variant

Adding a **daily 50-EMA trend filter** (only long above it, short below) gives
much steadier recent PnL:

| Version | 2025 PnL | 2026 PnL | 30d pass | 60d pass | EV / eval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Unfiltered (recommended) | +$664 | +$22 | 19% | 34% | +$288 |
| Daily EMA50 | +$2,084 | +$2,180 | 8% | 25% | +$136 |

The filter is more comfortable to hold but passes less often. For a
pass-the-eval goal, the unfiltered version is better. If you care more about a
smooth equity curve, use the filter (`orb-trend-15m` in research; it is not in
the deployable file yet).

## 8. What would make me stop

- Rolling 60-trade PnL below −$2,000 for two consecutive months, or
- Rolling 3-month profit factor < 0.9, or
- Three consecutive eval failures, or
- A change in MNQ behavior after a major regime shift (e.g. volatility
  collapse).

At that point, stop paying eval fees and go back to paper.

## 9. One-line summary

**MNQ-only ORB, 15m RTH, one trade/day, 3R target, 1.75 ATR stop. There is no
risk level that is both prudent and positive-EV. $400/trade is the least-bad
compromise (29% pass in 60 days, +$158 EV, 46% drawdown failures); $500 is the
aggressive lottery version (33%, +$288, 56% failures); $300 or less is negative
EV. If you are not comfortable risking 20% of the drawdown per trade, the
correct decision is not to buy the eval — not to shrink the risk and hope the
math changes.**
