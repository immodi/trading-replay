"""Donchian breakout, ported from research/egx-swing/strategies.ts.

Entry
-----
The research runner computes a 20-bar rolling maximum that *includes* the
current close, then enters when `close >= rolling_max(20)`. That is exactly a
"new 20-day closing high": the current close is the highest of the last 20
sessions. The screener uses the equivalent `prior_high_19` threshold, which is
the highest of the previous 19 closes.

Exit
----
The documented exit is the 10-day closing low. The research runner's
`donchianLow10` includes the current bar, so its `close < donchianLow10`
condition can never be true; in practice the research exits came from the 7.5%
stop and the 20-session time stop. The screener only evaluates entries, so
today's watchlist is unaffected. `exit_signal` below implements the intended
rule using the previous 10 closes, excluding today.
"""

from __future__ import annotations

from core.indicators import Series
from core.models import Stock, StrategySignal
from core.strategy import StrategyMeta, register


def _price(value: float) -> str:
    """Keep penny-stock precision without turning normal prices into noise."""

    if abs(value) >= 1:
        return f"{value:.2f}"
    return f"{value:.4f}".rstrip("0").rstrip(".")


class DonchianStrategy:
    meta = StrategyMeta(
        key="donchian",
        label="Donchian Breakout",
        description=(
            "Long when the close makes a new 20-day high. Stop 7.5% below the "
            "fill, maximum hold 20 sessions."
        ),
        exit_description=(
            "No fixed take-profit. Exit when the close breaks the 10-day low, "
            "the 7.5% stop is hit, or after 20 sessions."
        ),
        exit_short="10-day close low / stop / 20 sessions",
        universe="egx30",
        lookback_days=120,
        min_bars=60,
        stop_pct=0.075,
        max_hold_bars=20,
    )

    entry_lookback = 20
    exit_lookback = 10

    def evaluate(
        self,
        stock: Stock,
        indicators: dict[str, Series],
        index: int,
    ) -> StrategySignal:
        close = indicators["close"][index]
        prior_high = indicators["prior_high_19"][index]
        atr14 = indicators["atr14"][index]

        detail = {
            "close": close,
            "prior_high": prior_high,
            "donchian_high_20": indicators["donchian_high_20"][index],
            "exit_trigger": indicators["prior_low_10"][index],
            "exit_trigger_label": "10-day close low",
            "exit_trigger_kind": "price",
            "atr14": atr14,
            "atr_pct": indicators["atr_pct"][index],
            "avg_volume_20": indicators["avg_volume_20"][index],
            "rs60": indicators["rs60"][index],
            "sma50": indicators["sma50"][index],
            "ema10": indicators["ema10"][index],
            "ema30": indicators["ema30"][index],
            "adx14": indicators["adx14"][index],
            "rsi14": indicators["rsi14"][index],
            "gap_pct": indicators["gap_pct"][index],
        }

        factors = {
            "breakout_atr": indicators["breakout_atr"][index],
            "volume_ratio": indicators["volume_ratio"][index],
            "rs60": indicators["rs60"][index],
            "trend_flag": indicators["trend_flag"][index],
            "atr_pct": indicators["atr_pct"][index],
        }

        if close is None or prior_high is None:
            return StrategySignal(
                triggered=False,
                reason="Not enough history for the 20-day high.",
                detail=detail,
            )

        triggered = close >= prior_high
        if not triggered:
            reason = (
                f"Close {_price(close)} is below the prior 19-session high "
                f"{_price(prior_high)}."
            )
        else:
            reason = (
                f"Close {_price(close)} is a new 20-day closing high "
                f"(prior high {_price(prior_high)})."
            )

        return StrategySignal(
            triggered=triggered,
            reason=reason,
            factors={
                key: value
                for key, value in factors.items()
                if value is not None
            },
            detail=detail,
        )

    def exit_signal(
        self,
        stock: Stock,
        indicators: dict[str, Series],
        index: int,
    ) -> bool:
        close = indicators["close"][index]
        prior_low = indicators["prior_low_10"][index]
        if close is None or prior_low is None:
            return False
        return close < prior_low


register(DonchianStrategy())
