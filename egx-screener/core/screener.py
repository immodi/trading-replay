"""Orchestration: load -> indicators -> strategy -> filters -> rank -> size."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .config import load_config
from .data import (
    DataError,
    data_dir_for,
    load_stocks,
    resolve_universe,
    today_utc,
    validate_session,
)
from .filters import FilterContext, build_filters, rank_candidates
from .indicators import build_indicators
from .models import ScreenResult, ScreenRow, Stock
from .sizing import size_position
from .strategy import get_strategy

STATUS_ORDER = {
    "selected": 0,
    "signal": 1,
    "held": 2,
    "filtered": 3,
    "stale": 4,
    "no_signal": 5,
    "missing": 6,
}


@dataclass
class ScreenOptions:
    strategy_key: str = "donchian"
    data_dir: Path | None = None
    expected_date: date | None = None
    equity: float | None = None
    held: list[str] = field(default_factory=list)
    config_overrides: dict[str, Any] = field(default_factory=dict)


def _status_for(
    triggered: bool,
    eligible: bool,
    fresh: bool,
    missing: bool,
) -> str:
    if missing:
        return "missing"
    if not fresh:
        return "stale"
    if not eligible:
        return "filtered"
    if not triggered:
        return "no_signal"
    return "signal"


def _row_sort_key(row: ScreenRow) -> tuple[int, int, float, str]:
    status = "selected" if row.selected else row.status
    priority = STATUS_ORDER.get(status, 99)
    rank = row.rank if row.rank is not None else 10**9
    score = -(row.score if row.score is not None else -1.0)
    return (priority, rank, score, row.symbol)


def run_screen(options: ScreenOptions) -> ScreenResult:
    strategy = get_strategy(options.strategy_key)
    config = load_config(options.config_overrides)
    config["min_history_bars"] = max(
        int(config["min_history_bars"]),
        strategy.meta.min_bars,
    )

    if options.equity is not None:
        config["equity"] = float(options.equity)
    equity = float(config["equity"])

    universe_label, universe = resolve_universe(strategy.meta.universe)
    data_dir = options.data_dir or data_dir_for(strategy.meta.key)
    stocks, missing = load_stocks(data_dir, universe)

    if not stocks:
        raise DataError(
            f"No local data in {data_dir}. Run the refresh action or "
            f"`python3 egx-screener/screen.py --strategy {strategy.meta.key} --refresh`."
        )

    expected = options.expected_date or today_utc()
    session = validate_session(stocks, expected)

    filters = build_filters(config, session)
    by_symbol: dict[str, Stock] = {stock.symbol: stock for stock in stocks}
    rows: list[ScreenRow] = []
    candidate_indices: list[tuple[int, dict[str, float]]] = []

    for item in universe:
        stock = by_symbol.get(item.symbol)

        if stock is None:
            rows.append(
                ScreenRow(
                    symbol=item.symbol,
                    name=item.name,
                    slug=item.slug,
                    status="missing",
                    last_date=None,
                    close=None,
                    triggered=False,
                    eligible=False,
                    reasons=["No local file for this symbol."],
                )
            )
            continue

        indicators = build_indicators(stock.bars)
        index = len(stock.bars) - 1
        signal = strategy.evaluate(stock, indicators, index)
        last_bar = stock.bars[index]

        context = FilterContext(
            stock=stock,
            indicators=indicators,
            index=index,
            session_date=session,
            config=config,
        )
        filter_results = [item_filter.check(context) for item_filter in filters]

        eligible = all(result.passed for result in filter_results)
        fresh = next(
            (result.passed for result in filter_results if result.key == "fresh"),
            False,
        )
        status = _status_for(
            triggered=signal.triggered,
            eligible=eligible,
            fresh=fresh,
            missing=False,
        )

        reasons: list[str] = []
        if signal.triggered:
            reasons.append(signal.reason)
        else:
            reasons.append(signal.reason)
        for result in filter_results:
            if not result.passed:
                reasons.append(result.reason)

        row = ScreenRow(
            symbol=item.symbol,
            name=item.name,
            slug=item.slug,
            status=status,
            last_date=last_bar.date.isoformat(),
            close=last_bar.close,
            triggered=signal.triggered,
            eligible=eligible,
            factors=dict(signal.factors),
            detail=dict(signal.detail),
            filters=filter_results,
            reasons=reasons,
        )
        rows.append(row)

        if signal.triggered and eligible:
            candidate_indices.append((len(rows) - 1, dict(signal.factors)))

    scores = rank_candidates(candidate_indices, config["ranking_weights"])
    ranked = sorted(
        candidate_indices,
        key=lambda item: (-scores.get(item[0], 0.0), rows[item[0]].symbol),
    )

    held_symbols = {symbol.strip().upper() for symbol in options.held if symbol.strip()}
    available_slots = max(0, int(config["max_positions"]) - len(held_symbols))
    max_new = min(int(config["max_new_per_day"]), available_slots)
    selected_count = 0

    for rank, (row_index, _) in enumerate(ranked, start=1):
        row = rows[row_index]
        row.score = scores.get(row_index)
        row.rank = rank

        sizing = size_position(
            price=row.close or 0.0,
            equity=equity,
            stop_pct=strategy.meta.stop_pct,
            risk_per_trade=float(config["risk_per_trade"]),
            max_order_notional=float(config["max_order_notional"]),
            cost_pct_per_side=float(config["cost_pct_per_side"]),
            fixed_fee_per_order=float(config["fixed_fee_per_order"]),
        )
        row.stop = sizing.stop
        row.shares = sizing.shares
        row.notional = sizing.notional
        row.capped_by = sizing.capped_by
        row.entry_fee = sizing.entry_fee
        row.exit_fee = sizing.exit_fee
        row.round_trip_fees = sizing.round_trip_fees
        row.fee_pct_of_risk = sizing.fee_pct_of_risk
        row.breakeven_pct = sizing.breakeven_pct
        row.worst_case_loss = sizing.worst_case_loss
        row.fee_warning = (
            sizing.shares == 0 and sizing.capped_by == "fees"
        ) or (
            sizing.shares > 0
            and (
                sizing.fee_pct_of_risk
                > float(config["fee_warning_threshold"])
                or sizing.breakeven_pct > strategy.meta.stop_pct
            )
        )

        if row.symbol.upper() in held_symbols:
            row.held = True
            row.status = "held"
            continue

        if selected_count < max_new and sizing.shares > 0:
            row.selected = True
            selected_count += 1

    for row in rows:
        if row.held:
            row.status = "held"

    rows.sort(key=_row_sort_key)

    warnings: list[str] = []
    if missing:
        warnings.append(
            "Missing local files: "
            + ", ".join(stock.symbol for stock in missing)
        )
    stale = [
        row.symbol
        for row in rows
        if row.status == "stale"
    ]
    if stale:
        warnings.append(
            f"Stale (no bar for {session.isoformat()}): " + ", ".join(stale)
        )

    fee_warned = [row.symbol for row in rows if row.fee_warning]
    if fee_warned:
        warnings.append(
            "Fee drag is high for: "
            + ", ".join(fee_warned)
            + ". Check the fee details before ordering; at this account size "
            "the round-trip cost can consume a large part of the risk budget."
        )

    summary = {
        "universe": len(universe),
        "loaded": len(stocks),
        "missing": len(missing),
        "fresh": sum(1 for row in rows if row.status not in {"stale", "missing"}),
        "eligible": sum(1 for row in rows if row.eligible),
        "triggered": sum(1 for row in rows if row.triggered),
        "signals": sum(1 for row in rows if row.status == "signal"),
        "selected": selected_count,
        "held": sum(1 for row in rows if row.held),
        "filtered": sum(1 for row in rows if row.status == "filtered"),
        "stale": len(stale),
        "no_signal": sum(1 for row in rows if row.status == "no_signal"),
        "fee_warnings": len(fee_warned),
    }

    config_snapshot = dict(config)
    config_snapshot["strategy"] = {
        "key": strategy.meta.key,
        "label": strategy.meta.label,
        "description": strategy.meta.description,
        "exit_description": strategy.meta.exit_description,
        "exit_short": strategy.meta.exit_short,
        "universe": strategy.meta.universe,
        "lookback_days": strategy.meta.lookback_days,
        "min_bars": strategy.meta.min_bars,
        "stop_pct": strategy.meta.stop_pct,
        "max_hold_bars": strategy.meta.max_hold_bars,
    }

    return ScreenResult(
        strategy=strategy.meta.key,
        strategy_label=strategy.meta.label,
        session_date=session.isoformat(),
        expected_date=expected.isoformat(),
        universe=universe_label,
        looked_back_days=strategy.meta.lookback_days,
        equity=equity,
        rows=rows,
        summary=summary,
        warnings=warnings,
        config=config_snapshot,
        generated_at=datetime.now(tz=timezone.utc).isoformat(),
    )
