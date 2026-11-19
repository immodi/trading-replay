from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOL_ROOT = Path(__file__).resolve().parent.parent
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))

from core.sizing import size_position  # noqa: E402


class SizingTest(unittest.TestCase):
    def test_risk_cap_dominates_and_includes_fees(self) -> None:
        result = size_position(
            price=10.0,
            equity=100_000.0,
            stop_pct=0.075,
            risk_per_trade=0.01,
            max_order_notional=1_000_000.0,
            cost_pct_per_side=0.003,
        )
        self.assertEqual(result.shares, 1_234)
        self.assertEqual(result.capped_by, "risk")
        self.assertAlmostEqual(result.stop, 9.25)
        self.assertAlmostEqual(result.risk_budget, 1_000.0)
        self.assertLessEqual(result.worst_case_loss, result.risk_budget + 1e-9)
        self.assertGreater(result.round_trip_fees, 0.0)
        self.assertAlmostEqual(
            result.fee_pct_of_risk,
            result.round_trip_fees / result.risk_budget,
        )

    def test_notional_cap(self) -> None:
        result = size_position(
            price=10.0,
            equity=10_000_000.0,
            stop_pct=0.075,
            risk_per_trade=0.01,
            max_order_notional=1_000_000.0,
            cost_pct_per_side=0.003,
        )
        self.assertEqual(result.shares, 100_000)
        self.assertEqual(result.capped_by, "notional")

    def test_cash_cap(self) -> None:
        result = size_position(
            price=10.0,
            equity=100_000.0,
            stop_pct=0.075,
            risk_per_trade=0.01,
            max_order_notional=1_000_000.0,
            cost_pct_per_side=0.003,
            cash=1_000.0,
        )
        self.assertEqual(result.shares, 99)
        self.assertEqual(result.capped_by, "cash")

    def test_egx_default_commission_is_fixed_plus_percentage(self) -> None:
        result = size_position(
            price=25.53,
            equity=1_000.0,
            stop_pct=0.075,
            risk_per_trade=0.01,
            max_order_notional=1_000_000.0,
            cost_pct_per_side=0.001,
            fixed_fee_per_order=2.0,
        )
        self.assertEqual(result.shares, 3)
        self.assertAlmostEqual(result.round_trip_fees, 4.15318, places=4)
        self.assertAlmostEqual(result.fee_pct_of_risk, 0.415318, places=4)
        self.assertAlmostEqual(result.breakeven_pct, 0.0542389, places=4)
        self.assertLessEqual(result.worst_case_loss, result.risk_budget + 1e-9)

    def test_fixed_fee_dominates_at_small_equity(self) -> None:
        result = size_position(
            price=25.53,
            equity=1_000.0,
            stop_pct=0.075,
            risk_per_trade=0.01,
            max_order_notional=1_000_000.0,
            cost_pct_per_side=0.003,
            fixed_fee_per_order=2.0,
        )
        self.assertEqual(result.shares, 2)
        self.assertEqual(result.capped_by, "risk")
        self.assertGreater(result.fee_pct_of_risk, 0.40)
        self.assertGreater(result.breakeven_pct, 0.075)
        self.assertLessEqual(result.worst_case_loss, result.risk_budget + 1e-9)

    def test_fees_can_exceed_the_risk_budget(self) -> None:
        result = size_position(
            price=25.53,
            equity=100.0,
            stop_pct=0.075,
            risk_per_trade=0.01,
            max_order_notional=1_000_000.0,
            cost_pct_per_side=0.003,
            fixed_fee_per_order=2.0,
        )
        self.assertEqual(result.shares, 0)
        self.assertEqual(result.capped_by, "fees")
        self.assertAlmostEqual(result.fee_pct_of_risk, 1.0)

    def test_invalid_price_returns_zero(self) -> None:
        result = size_position(
            price=0.0,
            equity=100_000.0,
            stop_pct=0.075,
            risk_per_trade=0.01,
            max_order_notional=1_000_000.0,
            cost_pct_per_side=0.003,
        )
        self.assertEqual(result.shares, 0)
        self.assertEqual(result.capped_by, "invalid")


if __name__ == "__main__":
    unittest.main()
