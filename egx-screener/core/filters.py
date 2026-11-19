"""Composable eligibility gates and the cross-sectional ranker.

Eligibility filters are independent checks. Each one returns a `FilterResult`
so the UI can show exactly why a stock was rejected. The ranker is separate: it
only scores stocks that already triggered the strategy and passed every gate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from .indicators import Series
from .models import FilterResult, Stock


@dataclass
class FilterContext:
    stock: Stock
    indicators: dict[str, Series]
    index: int
    session_date: date
    config: dict


class Filter(Protocol):
    key: str
    label: str

    def check(self, context: FilterContext) -> FilterResult: ...


class HistoryFilter:
    key = "history"
    label = "History"

    def __init__(self, min_bars: int) -> None:
        self.min_bars = min_bars

    def check(self, context: FilterContext) -> FilterResult:
        count = len(context.stock.bars)
        passed = count >= self.min_bars
        return FilterResult(
            key=self.key,
            label=self.label,
            passed=passed,
            value=count,
            threshold=self.min_bars,
            reason=(
                f"{count} bars available (need {self.min_bars})."
                if not passed
                else f"{count} bars available."
            ),
        )


class PriceFilter:
    key = "price"
    label = "Minimum price"

    def __init__(self, min_price: float) -> None:
        self.min_price = min_price

    def check(self, context: FilterContext) -> FilterResult:
        close = context.indicators["close"][context.index]
        passed = close is not None and close >= self.min_price
        return FilterResult(
            key=self.key,
            label=self.label,
            passed=passed,
            value=close,
            threshold=self.min_price,
            reason=(
                f"Close {close:.2f} is below the {self.min_price:.2f} floor."
                if close is not None and not passed
                else f"Close {close:.2f} passes the {self.min_price:.2f} floor."
                if close is not None
                else "Close is unavailable."
            ),
        )


class LiquidityFilter:
    key = "liquidity"
    label = "Median traded value (20d)"

    def __init__(self, min_value: float) -> None:
        self.min_value = min_value

    def check(self, context: FilterContext) -> FilterResult:
        value = context.indicators["median_traded_value_20"][context.index]
        passed = value is not None and value >= self.min_value
        return FilterResult(
            key=self.key,
            label=self.label,
            passed=passed,
            value=value,
            threshold=self.min_value,
            reason=(
                f"20-day median traded value {value:,.0f} EGP is below "
                f"{self.min_value:,.0f} EGP."
                if value is not None and not passed
                else f"20-day median traded value {value:,.0f} EGP."
                if value is not None
                else "Liquidity history is unavailable."
            ),
        )


class VolumeFilter:
    key = "volume"
    label = "Traded today"

    def check(self, context: FilterContext) -> FilterResult:
        bar = context.stock.bars[context.index]
        passed = bar.volume > 0
        return FilterResult(
            key=self.key,
            label=self.label,
            passed=passed,
            value=bar.volume,
            threshold="> 0",
            reason=(
                "Today's volume is zero."
                if not passed
                else f"Today's volume is {bar.volume:,.0f}."
            ),
        )


class FreshBarFilter:
    key = "fresh"
    label = "Latest session"

    def __init__(self, session_date: date) -> None:
        self.session_date = session_date

    def check(self, context: FilterContext) -> FilterResult:
        bar = context.stock.bars[context.index]
        passed = bar.date == self.session_date
        return FilterResult(
            key=self.key,
            label=self.label,
            passed=passed,
            value=bar.date.isoformat(),
            threshold=self.session_date.isoformat(),
            reason=(
                f"Last bar is {bar.date.isoformat()}, not "
                f"{self.session_date.isoformat()}."
                if not passed
                else f"Last bar is {bar.date.isoformat()}."
            ),
        )


def build_filters(config: dict, session_date: date) -> list[Filter]:
    return [
        HistoryFilter(int(config["min_history_bars"])),
        FreshBarFilter(session_date),
        VolumeFilter(),
        PriceFilter(float(config["min_price"])),
        LiquidityFilter(float(config["min_median_traded_value_20d"])),
    ]


def percentile_ranks(values: list[float]) -> list[float]:
    """Ascending percentile in [0, 1], with ties sharing their average rank."""

    count = len(values)
    if count == 0:
        return []
    if count == 1:
        return [0.5]

    order = sorted(range(count), key=lambda index: values[index])
    output = [0.0] * count

    index = 0
    while index < count:
        end = index
        while end + 1 < count and values[order[end + 1]] == values[order[index]]:
            end += 1
        average_rank = (index + end) / 2.0
        percentile = average_rank / (count - 1)
        for position in range(index, end + 1):
            output[order[position]] = percentile
        index = end + 1

    return output


def rank_candidates(
    candidates: list[tuple[int, dict[str, float]]],
    weights: dict[str, float],
) -> dict[int, float]:
    """Score candidates by weighted percentiles of their factors.

    A negative weight rewards low values (used for `atr_pct`). Missing factors
    are skipped per candidate and the denominator is re-normalized.
    """

    scores = {index: 0.0 for index, _ in candidates}
    weight_sums = {index: 0.0 for index, _ in candidates}

    for factor, weight in weights.items():
        present = [
            (index, factors[factor])
            for index, factors in candidates
            if factor in factors and factors[factor] is not None
        ]
        if not present:
            continue

        percentiles = percentile_ranks([value for _, value in present])
        for (index, _), percentile in zip(present, percentiles):
            scores[index] += weight * percentile
            weight_sums[index] += abs(weight)

    return {
        index: (scores[index] / weight_sums[index] if weight_sums[index] else 0.0)
        for index in scores
    }
