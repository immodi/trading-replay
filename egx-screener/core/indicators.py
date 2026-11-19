"""Indicator math, ported from research/egx-swing/indicators.ts.

Every function returns a list aligned with the input bars. Unavailable values
are `None` rather than NaN so they serialize cleanly to JSON.
"""

from __future__ import annotations

from statistics import median

from .models import Bar

Series = list[float | None]


def _valid(value: float | None) -> bool:
    return value is not None and value == value


def sma(values: list[float], period: int) -> Series:
    output: Series = [None] * len(values)
    if period <= 0:
        return output

    running = 0.0
    for index, value in enumerate(values):
        running += value
        if index >= period:
            running -= values[index - period]
        if index >= period - 1:
            output[index] = running / period
    return output


def ema(values: list[float], period: int) -> Series:
    output: Series = [None] * len(values)
    if period <= 0 or len(values) < period:
        return output

    seed = sum(values[:period]) / period
    output[period - 1] = seed

    alpha = 2.0 / (period + 1)
    for index in range(period, len(values)):
        previous = output[index - 1]
        assert previous is not None
        output[index] = alpha * values[index] + (1 - alpha) * previous
    return output


def wilder(values: list[float | None], period: int) -> Series:
    output: Series = [None] * len(values)
    if period <= 0:
        return output

    start = 0
    while start < len(values) and not _valid(values[start]):
        start += 1

    seed_end = start + period - 1
    if seed_end >= len(values):
        return output

    seed = 0.0
    for index in range(start, seed_end + 1):
        value = values[index]
        if not _valid(value):
            return output
        seed += value  # type: ignore[operator]

    output[seed_end] = seed / period

    alpha = 1.0 / period
    for index in range(seed_end + 1, len(values)):
        value = values[index]
        if not _valid(value):
            continue
        previous = output[index - 1]
        assert previous is not None
        output[index] = alpha * value + (1 - alpha) * previous  # type: ignore[operator]
    return output


def rsi(values: list[float], period: int) -> Series:
    gains = [0.0] * len(values)
    losses = [0.0] * len(values)

    for index in range(1, len(values)):
        delta = values[index] - values[index - 1]
        gains[index] = max(0.0, delta)
        losses[index] = max(0.0, -delta)

    average_gain = wilder(gains, period)
    average_loss = wilder(losses, period)
    output: Series = [None] * len(values)

    for index in range(len(values)):
        gain = average_gain[index]
        loss = average_loss[index]
        if not _valid(gain) or not _valid(loss):
            continue

        assert gain is not None and loss is not None
        if gain == 0 and loss == 0:
            output[index] = 50.0
        elif loss == 0:
            output[index] = 100.0
        elif gain == 0:
            output[index] = 0.0
        else:
            rs = gain / loss
            output[index] = 100.0 - 100.0 / (1.0 + rs)
    return output


def true_range(bars: list[Bar]) -> list[float]:
    output: list[float] = []
    for index, bar in enumerate(bars):
        previous_close = bars[index - 1].close if index > 0 else bar.close
        output.append(
            max(
                bar.high - bar.low,
                abs(bar.high - previous_close),
                abs(bar.low - previous_close),
            )
        )
    return output


def atr(bars: list[Bar], period: int) -> Series:
    return wilder(true_range(bars), period)


def adx(bars: list[Bar], period: int) -> Series:
    plus_dm = [0.0] * len(bars)
    minus_dm = [0.0] * len(bars)

    for index in range(1, len(bars)):
        up_move = bars[index].high - bars[index - 1].high
        down_move = bars[index - 1].low - bars[index].low
        if up_move > down_move and up_move > 0:
            plus_dm[index] = up_move
        if down_move > up_move and down_move > 0:
            minus_dm[index] = down_move

    atr_values = atr(bars, period)
    plus_di: Series = []
    minus_di: Series = []

    for index, value in enumerate(wilder(plus_dm, period)):
        atr_value = atr_values[index]
        plus_di.append(
            100.0 * value / atr_value
            if _valid(value) and _valid(atr_value) and atr_value > 0
            else None
        )

    for index, value in enumerate(wilder(minus_dm, period)):
        atr_value = atr_values[index]
        minus_di.append(
            100.0 * value / atr_value
            if _valid(value) and _valid(atr_value) and atr_value > 0
            else None
        )

    dx: Series = []
    for plus, minus in zip(plus_di, minus_di):
        if not _valid(plus) or not _valid(minus):
            dx.append(None)
            continue
        assert plus is not None and minus is not None
        denominator = plus + minus
        dx.append(100.0 * abs(plus - minus) / denominator if denominator > 0 else None)

    return wilder(dx, period)


def rolling_max(values: list[float], period: int) -> Series:
    output: Series = [None] * len(values)
    for index in range(period - 1, len(values)):
        output[index] = max(values[index - period + 1 : index + 1])
    return output


def rolling_min(values: list[float], period: int) -> Series:
    output: Series = [None] * len(values)
    for index in range(period - 1, len(values)):
        output[index] = min(values[index - period + 1 : index + 1])
    return output


def rolling_std(values: list[float], period: int) -> Series:
    output: Series = [None] * len(values)
    for index in range(period - 1, len(values)):
        window = values[index - period + 1 : index + 1]
        mean = sum(window) / period
        variance = sum((value - mean) ** 2 for value in window) / period
        output[index] = variance**0.5
    return output


def build_indicators(bars: list[Bar]) -> dict[str, Series]:
    """Compute the shared indicator superset used by strategies and filters.

    The Donchian entry matches the research runner: the 20-bar window includes
    the current bar, so the entry threshold is the highest of the *previous 19*
    closes. `prior_high_19` exposes that threshold directly.
    """

    close = [bar.close for bar in bars]
    high = [bar.high for bar in bars]
    low = [bar.low for bar in bars]
    volume = [bar.volume for bar in bars]

    sma50 = sma(close, 50)
    sma50_prev: Series = [None] + sma50[:-1] if sma50 else []
    ema10 = ema(close, 10)
    ema20 = ema(close, 20)
    ema30 = ema(close, 30)
    atr14 = atr(bars, 14)
    rsi14 = rsi(close, 14)
    adx14 = adx(bars, 14)

    donchian_high_20 = rolling_max(close, 20)
    donchian_low_10 = rolling_min(close, 10)
    range_high_20 = rolling_max(high, 20)
    range_low_20 = rolling_min(low, 20)

    avg_volume_20: Series = [None] * len(bars)
    median_traded_value_20: Series = [None] * len(bars)
    for index in range(19, len(bars)):
        window = volume[index - 19 : index + 1]
        avg_volume_20[index] = sum(window) / 20
        median_traded_value_20[index] = median(
            close[offset] * volume[offset] for offset in range(index - 19, index + 1)
        )

    # Breakout threshold: highest close of the previous 19 sessions. When the
    # current close is >= this value, today is the 20-day closing high.
    prior_high_19: Series = [None] * len(bars)
    prior_low_10: Series = [None] * len(bars)
    for index in range(19, len(bars)):
        prior_high_19[index] = max(close[index - 19 : index])
    for index in range(10, len(bars)):
        prior_low_10[index] = min(close[index - 10 : index])

    rs60: Series = [None] * len(bars)
    breakout_atr: Series = [None] * len(bars)
    breakout_pct: Series = [None] * len(bars)
    volume_ratio: Series = [None] * len(bars)
    atr_pct: Series = [None] * len(bars)
    trend_flag: Series = [None] * len(bars)
    gap_pct: Series = [None] * len(bars)

    for index, bar in enumerate(bars):
        if index >= 60 and close[index - 60] > 0:
            rs60[index] = close[index] / close[index - 60] - 1.0

        previous_high = prior_high_19[index]
        atr_value = atr14[index]
        if _valid(previous_high) and _valid(atr_value):
            assert previous_high is not None and atr_value is not None
            breakout_pct[index] = (
                close[index] / previous_high - 1.0 if previous_high > 0 else None
            )
            breakout_atr[index] = (
                (close[index] - previous_high) / atr_value if atr_value > 0 else None
            )

        average_volume = avg_volume_20[index]
        if _valid(average_volume) and average_volume > 0:  # type: ignore[operator]
            volume_ratio[index] = bar.volume / average_volume  # type: ignore[operator]

        if _valid(atr_value) and bar.close > 0:
            atr_pct[index] = atr_value / bar.close  # type: ignore[operator]

        sma_value = sma50[index]
        sma_previous = sma50_prev[index]
        if _valid(sma_value) and _valid(sma_previous):
            assert sma_value is not None and sma_previous is not None
            trend_flag[index] = (
                1.0 if bar.close > sma_value and sma_value > sma_previous else 0.0
            )

        if index > 0 and bars[index - 1].close > 0:
            gap_pct[index] = bar.open / bars[index - 1].close - 1.0

    return {
        "close": [bar.close for bar in bars],
        "sma50": sma50,
        "sma50_prev": sma50_prev,
        "ema10": ema10,
        "ema20": ema20,
        "ema30": ema30,
        "atr14": atr14,
        "atr_pct": atr_pct,
        "rsi14": rsi14,
        "adx14": adx14,
        "donchian_high_20": donchian_high_20,
        "donchian_low_10": donchian_low_10,
        "prior_high_19": prior_high_19,
        "prior_low_10": prior_low_10,
        "range_high_20": range_high_20,
        "range_low_20": range_low_20,
        "avg_volume_20": avg_volume_20,
        "median_traded_value_20": median_traded_value_20,
        "rs60": rs60,
        "breakout_atr": breakout_atr,
        "breakout_pct": breakout_pct,
        "volume_ratio": volume_ratio,
        "trend_flag": trend_flag,
        "gap_pct": gap_pct,
    }


def last(series: Series, index: int = -1) -> float | None:
    if not series:
        return None
    try:
        return series[index]
    except IndexError:
        return None
