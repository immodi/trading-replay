# Frozen design (before OOS)

- Strategy: 30-minute opening-range breakout, 15-minute RTH bars.
- Opening range: first 2 RTH bars (09:30-10:00 ET).
- Entry: next bar open after a 15m close outside the range; one trade/day.
- Filter: opening range width <= 2.25 x ATR(14) (RTH ATR).
- Stop: 1.75 x ATR(14); target: 3R; no trend filter.
- Exit: 15:45 ET bar (12:45 half-days), fill next open; no entries after 15:00 ET.
- No US market holidays; RTH-only indicators; no overnight holds.
- Sizing: riskDollars = 175 per instrument, maxContracts = 10.
- Portfolio: all six micros, one position per instrument, same rules.
- Prop: 50k, +3,000 target, 2,000 trailing DD on intraday unrealized PnL,
  floor locks at starting balance, no daily loss limit, no consistency rule,
  60 trading-day limit, pass on intraday touch.
- Funded: 5 winning days >= $200, 90% split, $2,000 first-payout cap,
  2,000 trailing intraday DD, 60-day limit.
- Development: 2021-07-12 .. 2023-12-29.
- OOS (untouched): 2024-01-01 .. 2026-11-02.
