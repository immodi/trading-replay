"""EMA 10/30 crossover, included to demonstrate the strategy plug-in API.

Entry: EMA10 crosses above EMA30 on the latest close.
Exit:  EMA10 crosses below EMA30.
Stop:  7.5% below the fill; maximum hold 20 sessions (same risk frame as the Donchian strategy).
"""

from __future__ import annotations

from core.indicators import Series
from core.models import Stock, StrategySignal
from core.strategy import StrategyMeta, register


class EmaCrossStrategy:
    meta = StrategyMeta(
        key="ema_cross",
        label="EMA 10/30 Crossover",
        description=(
            "Long when EMA10 crosses above EMA30. Stop 7.5% below the fill, "
            "maximum hold 20 sessions."
        ),
        exit_description=(
            "No fixed take-profit. Exit when EMA10 crosses below EMA30, the "
            "7.5% stop is hit, or after 20 sessions."
        ),
        exit_short="EMA10/EMA30 cross / stop / 20 sessions",
        universe="egx30",
        lookback_days=120,
        min_bars=60,
        stop_pct=0.075,
        max_hold_bars=20,
    )

    def evaluate(
        self,
        stock: Stock,
        indicators: dict[str, Series],
        index: int,
    ) -> StrategySignal:
        close = indicators["close"][index]
        fast = indicators["ema10"][index]
        slow = indicators["ema30"][index]
        fast_previous = indicators["ema10"][index - 1] if index > 0 else None
        slow_previous = indicators["ema30"][index - 1] if index > 0 else None
        atr14 = indicators["atr14"][index]

        detail = {
            "close": close,
            "ema10": fast,
            "ema30": slow,
            "ema10_previous": fast_previous,
            "ema30_previous": slow_previous,
            "exit_trigger": slow,
            "exit_trigger_label": "EMA10 crosses below EMA30",
            "exit_trigger_kind": "cross",
            "atr14": atr14,
            "atr_pct": indicators["atr_pct"][index],
            "rs60": indicators["rs60"][index],
            "volume_ratio": indicators["volume_ratio"][index],
        }

        factors = {
            "cross_strength": (
                (fast - slow) / atr14
                if fast is not None
                and slow is not None
                and atr14 is not None
                and atr14 > 0
                else None
            ),
            "volume_ratio": indicators["volume_ratio"][index],
            "rs60": indicators["rs60"][index],
            "trend_flag": indicators["trend_flag"][index],
            "atr_pct": indicators["atr_pct"][index],
        }

        if (
            fast is None
            or slow is None
            or fast_previous is None
            or slow_previous is None
        ):
            return StrategySignal(
                triggered=False,
                reason="Not enough history for EMA10/EMA30.",
                detail=detail,
            )

        triggered = fast_previous <= slow_previous and fast > slow
        if triggered:
            reason = "EMA10 crossed above EMA30 on the latest close."
        else:
            reason = "No fresh EMA10/EMA30 upward crossover."

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
        if index <= 0:
            return False
        fast = indicators["ema10"][index]
        slow = indicators["ema30"][index]
        fast_previous = indicators["ema10"][index - 1]
        slow_previous = indicators["ema30"][index - 1]
        if None in (fast, slow, fast_previous, slow_previous):
            return False
        return fast_previous >= slow_previous and fast < slow  # type: ignore[operator]


register(EmaCrossStrategy())
