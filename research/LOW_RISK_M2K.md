# Low-risk M2K plan for a $1,000 account

**Goal:** the least dollar risk per trade that still has a positive, repeatable
edge. This is not a growth-maximizing strategy. It is designed to survive on a
small cash account, trade rarely, and avoid the 10–45% per-trade risk that
killed every $500 variant.

## 1. The setup

- **Instrument:** M2K (Micro E-mini Russell 2000), one contract maximum.
- **Chart:** 15-minute, US regular session 09:30–16:00 ET.
- **Rules:**
  1. Opening range = high/low of the first 30 minutes (first two 15m bars).
  2. Skip the day if the opening range is wider than **2.25 × ATR(14)**.
  3. Enter at the next 15m open on a close above the range high (long) or below
     the range low (short). One trade per day.
  4. Stop **1.75 × ATR(14)**, target **3R**.
  5. **Risk cap: $50.** Quantity is `floor(50 / (stop points × $5 + round-trip
     commission))`, capped at 1. If one contract would risk more than $50, the
     trade is skipped. This is the key rule.
  6. Flatten on the 15:45 ET bar (12:45 half-days); no entries after 15:00 ET;
     no US market holidays. No overnight holds.
- **Deployable file:** `research/deployable/m2k-orb-lowrisk.js`. Defaults are
  already `riskDollars=50`, `maxContracts=1`, `stopAtr=1.75`, `rewardRisk=3`,
  `maxOrWidthAtr=2.25`. It produces exactly the same trades as the research
  module (verified by `research/verify-m2k.ts`).

## 2. Why M2K and why this cap

One M2K contract is the cheapest normal intraday risk in the data set:

| Instrument | Typical 1-contract ATR risk | Minimum practical risk |
| --- | ---: | ---: |
| M2K | $35–70 | ~$32 |
| MCL | $20–60 | ~$21 |
| MGC | $35–70 | ~$27 |
| MYM | $45–90 | ~$32 |
| MES | $50–110 | ~$35 |
| MNQ | $80–225 | ~$80 |

A $50 cap is 5% of $1,000 and about 1–1.5× the typical M2K ATR. The cap filters
out high-volatility days where one contract would risk 10–20% of the account.
At a $25 cap the strategy takes **zero trades** (one M2K contract always risks
more than $25), so $1,000 is the practical minimum for this instrument.

## 3. Results

### Development 2021-07-12 → 2023-12-29
- 75 trades, **+$618**, PF **1.57**, win 50.7%, max DD **$246**.

### Out-of-sample 2024-01-01 → 2026-11-02
- 85 trades, **+$452**, PF **1.34**, win 51.8%, max DD **$319**.

### Full sample
- 160 trades, **+$1,070**, PF **1.44**, win 51.3%,
  avg win $42, avg loss $31, expectancy **$6.69/trade**, max DD **$319**.

| Year | Trades | Net PnL |
| --- | ---: | ---: |
| 2021 (from Jul) | 11 | +$16 |
| 2022 | 14 | +$208 |
| 2023 | 50 | +$394 |
| 2024 | 37 | +$194 |
| 2025 | 40 | +$327 |
| 2026 (to Nov) | 8 | −$68 |

### $1,000 account path
- Final **$2,070**, max DD **$308 (31%)**.
- Average risk **$44 (4.4%)**, max **$47 (4.7%)**.
- Max losing streak **6 trades** (≈ −$264, 26%).
- Never ruined; doubled at trade 87.
- Bootstrap (250-trade resample): P(double) **87.8%**, P(ruin) **0.2%**.
- Minimum capital for 5% max risk: **$950**.

### $500 account path (for comparison)
- Max DD **$308 (62%)**, average risk 8.9%, max 9.5%.
- Never ruined in-sample, but P(ruin) **5.6%** and a 62% drawdown is not
  "least risk". **Use $1,000, not $500.**

### Cost stress (full sample)
| Costs | Net | PF | Max DD |
| --- | ---: | ---: | ---: |
| Baseline ($1.25/side, 1 tick) | +$1,070 | 1.44 | $319 |
| 2× slippage | +$865 | 1.34 | $332 |
| 1.5× commission | +$841 | 1.38 | $339 |
| Both | +$651 | 1.28 | $355 |

The edge survives realistic cost increases, but it is thin. At 2× both, the
expectancy is $4.55/trade.

## 4. Parameter plateau

Cap $40–60, stop 1.5–1.75 ATR and target 2.5–3.5R are all positive in dev and
OOS. Stop 2.0 ATR fails OOS; cap $60 raises the max DD to $640–1,070, too much
for $1k. The chosen cap $50 / stop 1.75 / 3R is mid-plateau, not a maximum:

| Cap | Stop | Dev net / PF | OOS net / PF | OOS DD |
| ---: | ---: | ---: | ---: | ---: |
| $50 | 1.5 | +$768 / 1.35 | +$686 / 1.20 | $512 |
| **$50** | **1.75** | **+$618 / 1.57** | **+$452 / 1.34** | **$319** |
| $50 | 2.0 | +$70 / 1.13 | −$84 / 0.90 | $503 |
| $40 | 1.75 | +$48 / 1.28 | +$226 / 1.71 | $135 |
| $60 | 1.75 | +$1,195 / 1.52 | +$991 / 1.26 | $640 |

## 5. How to trade it

1. Paper-trade it for at least 1–2 months (≈ 5–10 trades). The strategy is slow;
   do not judge it on a handful of trades.
2. Fund $1,000. Trade **1 M2K**, never more.
3. Set the $50 risk cap. If the platform's calculated 1-contract risk is above
   $50, **skip the day**. Do not widen the cap to force a trade.
4. No overnight, no holidays, flat by 16:00 ET.
5. Do not add instruments to "make up" for the low trade count. The low
   frequency is the risk control.
6. Review after 30 trades: if PF < 0.9 or three consecutive losing months, stop
   and re-evaluate on paper.

## 6. Honest caveats

- **Small sample.** 160 trades over 5.4 years, ~30/year. The expectancy is
  $6.69/trade; the statistical edge is weak and could be partly luck.
- **Slow.** At $1,000 and 1 contract, +$1,070 over 5.4 years is roughly
  **$200/year — about 20% of the initial balance per year, or ~14% CAGR if
  compounded** — with a 31% drawdown. It is not a living; it is a low-risk way
  to participate.
- **2026 is thin.** High M2K volatility caused the $50 cap to skip most days:
  only 8 trades, −$68. If volatility stays high, the strategy will barely trade.
  That is the cap doing its job, but it also means low activity.
- **Max DD is still 31%.** A 6-loss streak is 26%. Size accordingly; $1,000 is
  the minimum, not a comfortable amount.
- **Rolls and data.** M2K rolls quarterly; the strategy uses same-session RTH
  levels so roll gaps do not enter the signal. One or two holiday/half-day
  edge cases are handled by the calendar rules.
- **Broker margin.** Check NinjaTrader's current intraday margin for M2K. $1,000
  should cover one contract at most brokers, but verify before trading.

## 7. Reproduce

```bash
# Full-sample engine result
node --import tsx research/run.ts --strategy orb-15m --symbol m2k --tf 15 \
  --start 2021-07-12 --end 2026-11-02 --risk 50 \
  --params '{"openingRangeBars":2,"rewardRisk":3,"stopAtr":1.75,"trendEma":0,"orWidthMinAtr":0,"orWidthMaxAtr":2.25,"maxContracts":1}'

# $1,000 account path + bootstrap
node --import tsx research/personal.ts --strategy orb-15m --symbol m2k --tf 15 \
  --start 2021-07-12 --end 2026-11-02 --risk 50 \
  --params '{"openingRangeBars":2,"rewardRisk":3,"stopAtr":1.75,"trendEma":0,"orWidthMinAtr":0,"orWidthMaxAtr":2.25,"maxContracts":1}' \
  --capital 1000

# Verify the preset matches the research module
node --import tsx research/verify-m2k.ts
```

Grid results: `research/results/m2k_lowrisk_grid.csv`.
