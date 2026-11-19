from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOL_ROOT = Path(__file__).resolve().parent.parent
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))

from core.indicators import (  # noqa: E402
    build_indicators,
    ema,
    rolling_max,
    rolling_min,
    rsi,
    sma,
)
from core.models import Bar  # noqa: E402


def make_bars(closes: list[float], volumes: list[float] | None = None) -> list[Bar]:
    volumes = volumes or [1_000_000.0] * len(closes)
    return [
        Bar(
            time=1_700_000_000 + index * 86_400,
            open=close,
            high=close * 1.01,
            low=close * 0.99,
            close=close,
            volume=volumes[index],
        )
        for index, close in enumerate(closes)
    ]


class IndicatorTest(unittest.TestCase):
    def test_sma(self) -> None:
        self.assertEqual(sma([1, 2, 3, 4, 5], 3), [None, None, 2.0, 3.0, 4.0])

    def test_ema_seeds_with_sma(self) -> None:
        values = ema([1, 2, 3, 4, 5], 3)
        self.assertIsNone(values[0])
        self.assertIsNone(values[1])
        self.assertEqual(values[2], 2.0)
        self.assertAlmostEqual(values[3] or 0.0, 3.0)

    def test_rolling_max_min_include_current_bar(self) -> None:
        self.assertEqual(
            rolling_max([1, 3, 2, 5, 4], 3),
            [None, None, 3, 5, 5],
        )
        self.assertEqual(
            rolling_min([1, 3, 2, 5, 4], 3),
            [None, None, 1, 2, 2],
        )

    def test_rsi_on_monotonic_series(self) -> None:
        values = rsi([float(index) for index in range(1, 40)], 14)
        self.assertIsNotNone(values[-1])
        self.assertAlmostEqual(values[-1] or 0.0, 100.0)

    def test_donchian_thresholds(self) -> None:
        closes = [10.0 + index * 0.1 for index in range(30)]
        indicators = build_indicators(make_bars(closes))
        index = len(closes) - 1
        self.assertAlmostEqual(
            indicators["prior_high_19"][index] or 0.0,
            max(closes[index - 19 : index]),
        )
        self.assertAlmostEqual(
            indicators["donchian_high_20"][index] or 0.0,
            max(closes[index - 19 : index + 1]),
        )

    def test_breakout_factors_present_on_new_high(self) -> None:
        closes = [10.0] * 79 + [12.0]
        indicators = build_indicators(make_bars(closes))
        index = len(closes) - 1
        self.assertIsNotNone(indicators["breakout_atr"][index])
        self.assertGreater(indicators["breakout_atr"][index] or 0.0, 0.0)
        self.assertIsNotNone(indicators["volume_ratio"][index])
        self.assertEqual(indicators["trend_flag"][index], 1.0)


if __name__ == "__main__":
    unittest.main()
