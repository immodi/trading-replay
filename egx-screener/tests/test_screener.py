from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

TOOL_ROOT = Path(__file__).resolve().parent.parent
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))

from core.data import (  # noqa: E402
    DATA_ROOT,
    NoSessionError,
    is_managed_data_dir,
    resolve_universe,
)
from core.screener import ScreenOptions, run_screen  # noqa: E402

START = date(2026, 1, 1)


def stamp(day: date) -> int:
    return int(datetime.combine(day, time.min, tzinfo=timezone.utc).timestamp())


def write_stock(
    directory: Path,
    symbol: str,
    closes: list[float],
    volumes: list[float] | None = None,
    end_date: date | None = None,
) -> date:
    volumes = volumes or [1_000_000.0] * len(closes)
    last_date = end_date or START + timedelta(days=len(closes) - 1)
    first_date = last_date - timedelta(days=len(closes) - 1)

    bars = [
        {
            "time": stamp(first_date + timedelta(days=index)),
            "open": close,
            "high": close * 1.01,
            "low": close * 0.99,
            "close": close,
            "volume": volumes[index],
        }
        for index, close in enumerate(closes)
    ]

    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{symbol}-1d.json").write_text(json.dumps(bars), encoding="utf-8")
    return last_date


def breakout_closes() -> list[float]:
    return [10.0 + index * 0.05 for index in range(79)] + [15.0]


class ScreenerTest(unittest.TestCase):
    def test_refresh_guard_only_allows_managed_data(self) -> None:
        self.assertTrue(is_managed_data_dir(DATA_ROOT / "donchian"))
        self.assertFalse(is_managed_data_dir(TOOL_ROOT.parent / "data" / "egx30"))

    def test_symbol_list_universe(self) -> None:
        label, stocks = resolve_universe(["COMI", "etel"])
        self.assertEqual([stock.symbol for stock in stocks], ["COMI", "ETEL"])
        self.assertIn("COMI", label)

    def test_breakout_is_selected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            last_date = write_stock(data_dir, "COMI", breakout_closes())

            result = run_screen(
                ScreenOptions(
                    strategy_key="donchian",
                    data_dir=data_dir,
                    expected_date=last_date,
                )
            )

            row = next(item for item in result.rows if item.symbol == "COMI")
            self.assertTrue(row.triggered)
            self.assertTrue(row.eligible)
            self.assertTrue(row.selected)
            self.assertEqual(row.status, "signal")
            self.assertEqual(row.rank, 1)
            self.assertIsNotNone(row.score)
            self.assertGreater(row.shares or 0, 0)
            self.assertGreater(row.notional or 0, 0)
            self.assertEqual(result.summary["selected"], 1)
            self.assertEqual(result.session_date, last_date.isoformat())

    def test_close_below_prior_high_has_no_signal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            closes = [10.0] * 79 + [9.0]
            last_date = write_stock(data_dir, "COMI", closes)

            result = run_screen(
                ScreenOptions(
                    strategy_key="donchian",
                    data_dir=data_dir,
                    expected_date=last_date,
                )
            )

            row = next(item for item in result.rows if item.symbol == "COMI")
            self.assertFalse(row.triggered)
            self.assertTrue(row.eligible)
            self.assertFalse(row.selected)
            self.assertEqual(row.status, "no_signal")

    def test_liquidity_gate_filters_the_stock(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            closes = breakout_closes()
            last_date = write_stock(
                data_dir,
                "COMI",
                closes,
                volumes=[10.0] * len(closes),
            )

            result = run_screen(
                ScreenOptions(
                    strategy_key="donchian",
                    data_dir=data_dir,
                    expected_date=last_date,
                )
            )

            row = next(item for item in result.rows if item.symbol == "COMI")
            self.assertTrue(row.triggered)
            self.assertFalse(row.eligible)
            self.assertFalse(row.selected)
            self.assertEqual(row.status, "filtered")
            liquidity = next(item for item in row.filters if item.key == "liquidity")
            self.assertFalse(liquidity.passed)

    def test_stale_symbol_is_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            closes = breakout_closes()
            last_date = write_stock(data_dir, "COMI", closes)
            write_stock(
                data_dir,
                "ETEL",
                closes,
                end_date=last_date - timedelta(days=1),
            )

            result = run_screen(
                ScreenOptions(
                    strategy_key="donchian",
                    data_dir=data_dir,
                    expected_date=last_date,
                )
            )

            etel = next(item for item in result.rows if item.symbol == "ETEL")
            self.assertEqual(etel.status, "stale")
            self.assertFalse(etel.eligible)
            self.assertFalse(etel.selected)
            self.assertTrue(any("ETEL" in warning for warning in result.warnings))

    def test_missing_session_raises(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            closes = breakout_closes()
            last_date = write_stock(
                data_dir,
                "COMI",
                closes,
                end_date=START + timedelta(days=len(closes) - 2),
            )

            with self.assertRaises(NoSessionError):
                run_screen(
                    ScreenOptions(
                        strategy_key="donchian",
                        data_dir=data_dir,
                        expected_date=last_date + timedelta(days=1),
                    )
                )


if __name__ == "__main__":
    unittest.main()
