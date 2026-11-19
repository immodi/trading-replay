"""Reference position sizing for the daily watchlist.

Prices here are today's closes. The real order fills at the next open, so the
stop and share count must be recalculated from the actual fill before placing
an order.

Fees
----
The risk budget is a **worst-case loss budget**, not just the stop distance.
For a long position the round-trip cost is::

    entry_fee = notional * cost_pct_per_side + fixed_fee_per_order
    exit_fee  = notional * cost_pct_per_side + fixed_fee_per_order

The exit fee is approximated with the entry notional (conservative: the exit
at a stop is smaller). Shares are solved so that::

    shares * stop_distance + entry_fee + exit_fee <= equity * risk_per_trade
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SizingResult:
    shares: int
    notional: float
    stop: float
    stop_distance: float
    risk_budget: float
    capped_by: str
    entry_fee: float
    exit_fee: float
    round_trip_fees: float
    fee_pct_of_risk: float
    breakeven_pct: float
    worst_case_loss: float


def size_position(
    price: float,
    equity: float,
    stop_pct: float,
    risk_per_trade: float,
    max_order_notional: float,
    cost_pct_per_side: float,
    fixed_fee_per_order: float = 0.0,
    cash: float | None = None,
) -> SizingResult:
    if price <= 0 or equity <= 0 or stop_pct <= 0:
        return SizingResult(0, 0.0, 0.0, 0.0, 0.0, "invalid", 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    stop_distance = price * stop_pct
    risk_budget = equity * risk_per_trade
    round_trip_fixed = max(0.0, fixed_fee_per_order) * 2.0
    fee_per_share = price * cost_pct_per_side * 2.0

    if risk_budget <= round_trip_fixed:
        return SizingResult(
            shares=0,
            notional=0.0,
            stop=price * (1.0 - stop_pct),
            stop_distance=stop_distance,
            risk_budget=risk_budget,
            capped_by="fees",
            entry_fee=0.0,
            exit_fee=0.0,
            round_trip_fees=round_trip_fixed,
            fee_pct_of_risk=1.0,
            breakeven_pct=0.0,
            worst_case_loss=0.0,
        )

    # Worst-case loss including both sides' fees must stay inside the budget.
    risk_quantity = int(
        (risk_budget - round_trip_fixed) // (stop_distance + fee_per_share)
    )
    notional_quantity = int(max_order_notional // price)
    available_cash = equity if cash is None else cash
    cash_quantity = int(
        max(0.0, available_cash - max(0.0, fixed_fee_per_order))
        // (price * (1.0 + cost_pct_per_side))
    )

    limits = {
        "risk": risk_quantity,
        "notional": notional_quantity,
        "cash": cash_quantity,
    }
    shares = max(0, min(limits.values()))
    capped_by = min(limits, key=limits.get) if shares > 0 else "fees"

    notional = shares * price
    entry_fee = notional * cost_pct_per_side + max(0.0, fixed_fee_per_order)
    exit_fee = notional * cost_pct_per_side + max(0.0, fixed_fee_per_order)
    round_trip_fees = entry_fee + exit_fee
    fee_pct_of_risk = round_trip_fees / risk_budget if risk_budget > 0 else 0.0
    breakeven_pct = round_trip_fees / notional if notional > 0 else 0.0
    worst_case_loss = shares * stop_distance + round_trip_fees

    return SizingResult(
        shares=shares,
        notional=notional,
        stop=price * (1.0 - stop_pct),
        stop_distance=stop_distance,
        risk_budget=risk_budget,
        capped_by=capped_by,
        entry_fee=entry_fee,
        exit_fee=exit_fee,
        round_trip_fees=round_trip_fees,
        fee_pct_of_risk=fee_pct_of_risk,
        breakeven_pct=breakeven_pct,
        worst_case_loss=worst_case_loss,
    )
