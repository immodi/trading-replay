# $500 personal account — what the data says

**Conclusion: there is no reasonable strategy for a $500 NinjaTrader account
trading one micro contract from this data set.** The account, not the strategy,
is the binding constraint. Every 1-contract ATR-stop version ruins the account
in the 2024–2026 sample, and the tight fixed-dollar-stop versions remove the
edge. The minimum practical account for one micro is roughly **$5,000**
(conservative, max-risk basis) and preferably **$10,000+**.

## Method

- Existing engine, same data and costs as the prop research.
- **Fixed 1 contract** (not risk-based sizing; with $500 you cannot fractional-size).
- Actual trade sequence, starting balance $500.
- Ruin = equity < $100 (cannot margin another trade).
- Bootstrap: 5,000 resampled paths of 250 trades, ruin at < $100, double at ≥ $1,000.
- Costs: $1.25–1.50/side, 1 tick/side slippage.
- OOS 2024-01-01 → 2026-11-02.

## 1-contract ORB, ATR stop (1.75 ATR, 3R target)

| Instrument | OOS net | Max DD | Avg risk/trade | Max risk | P(ruin) on $500 | Min capital for 5% risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MES | −$4,501 | $4,983 | $108 (22%) | $683 (137%) | 68% | $13,658 |
| MNQ | +$1,971 | $7,213 | $225 (45%) | $1,070 (214%) | 56% | $21,390 |
| M2K | −$1,639 | $2,763 | $68 (14%) | $254 (51%) | 72% | $5,087 |
| MYM | −$1,245 | $1,797 | $82 (16%) | $380 (76%) | 67% | $7,604 |
| MGC | +$5,064 | $4,254 | $145 (29%) | $1,126 (225%) | 54% | $22,525 |
| MCL | −$2,825 | $3,134 | $59 (12%) | $418 (84%) | 75% | $8,364 |

Even MNQ and MGC, which end positive, **ruin a $500 account first** (MNQ at
trade 23, MGC at trade 41) before the eventual gain. The average risk per trade
is 12–45% of the account; the max is over 100% on volatility spikes.

## 2. Fixed-dollar stops (the only way to keep risk small)

Stop = `riskDollars / pointValue`; 1 contract; 3R target.

- **M2K ORB, OOS:** $25 risk → −$1,660 (PF 0.76); $50 → −$920 (0.91);
  $75 → −$786 (0.93); $100 → −$388 (0.97). All negative.
- **MCL ORB, OOS:** $25 → −$2,714 (0.77); $50 → −$3,662 (0.79);
  $75 → −$5,256 (0.74); $100 → −$3,918 (0.81). All negative.
- **M2K opening-dip, $50 fixed stop:** OOS +$337 (PF 1.04), final $837,
  doubled at trade 52 — but **dev −$2,201 (PF 0.78)** and **full sample −$1,864
  (PF 0.90)**. The OOS result is noise, not an edge. Bootstrap P(ruin) 54%,
  P(double) 46%.

Tight stops turn the strategy into noise; wide stops turn the account into a
coin flip. There is no middle window with a real edge.

## 3. Why $500 is too small

One micro's normal ATR stop risks:

| Instrument | Typical 1-contract risk | % of $500 |
| --- | ---: | ---: |
| MCL | $20–60 | 4–12% |
| M2K | $35–70 | 7–14% |
| MGC | $35–70 | 7–14% |
| MYM | $45–90 | 9–18% |
| MES | $50–110 | 10–22% |
| MNQ | $80–225 | 16–45% |

A conventional risk budget is 1–2% of the account per trade. At 1–2%, one micro
needs an account of roughly:

- M2K/MCL: **$3,500–10,000**
- MES/MYM: **$5,000–14,000**
- MNQ/MGC: **$11,000–22,000+**

At $500 you are risking 5–45% per trade. A normal 6–10 loss streak is fatal.
No indicator, target, or filter changes that arithmetic.

## 4. What is actually reasonable

1. **Do not trade $500 live on these micros.** Use a simulator/paper account
   and keep the $500.
2. **Save to at least $5,000**, preferably $10,000, then trade **1 M2K or MCL**
   with a $50–100 stop (1–2% risk). Even then, the edge in this data is thin;
   paper-trade the exact rules for 2–3 months first.
3. If the goal is to trade a larger account sooner, a **prop evaluation** is
   effectively a leveraged 50k account for ~$150. It is cheaper than funding a
   personal account to $5k, but the eval target/DD and the strategy edge remain
   the constraints (see `MNQ_PLAN.md`: MNQ-only, $400 risk, ~29–33% pass in
   60 days).
4. NinjaTrader/broker intraday margin also matters: at many brokers $500 is at
   or below the day margin for one micro. Check the current requirement before
   assuming you can even open the trade.

## 5. Reproduce

```bash
# Fixed 1-contract, actual $500 sequence + bootstrap
node --import tsx research/personal.ts --strategy orb-fixed-15m --symbol m2k \
  --tf 15 --start 2024-01-01 --end 2026-11-02 \
  --params '{"openingRangeBars":2,"rewardRisk":3,"stopAtr":1.75,"trendEma":0,"orWidthMinAtr":0,"orWidthMaxAtr":2.25}'

# Fixed-dollar risk variant
node --import tsx research/personal.ts --strategy orb-cash-15m --symbol m2k \
  --tf 15 --start 2024-01-01 --end 2026-11-02 --risk 50 \
  --params '{"openingRangeBars":2,"rewardRisk":3,"trendEma":0,"orWidthMaxAtr":2.25,"riskDollars":50}'
```

`research/personal.ts` prints dollar risk, max drawdown, ruin, the bootstrap
double/ruin probabilities, and the minimum capital for 5% risk.
