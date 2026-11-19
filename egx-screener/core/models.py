"""Shared data models for the EGX daily screener."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass(frozen=True)
class Bar:
    """One daily OHLCV bar. `time` is an epoch-second UTC timestamp."""

    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    @property
    def date(self) -> date:
        from datetime import datetime, timezone

        return datetime.fromtimestamp(self.time, tz=timezone.utc).date()

    @property
    def traded_value(self) -> float:
        return self.close * self.volume


@dataclass(frozen=True)
class UniverseStock:
    symbol: str
    name: str
    slug: str


@dataclass
class Stock:
    symbol: str
    name: str
    slug: str
    bars: list[Bar]

    @property
    def last_bar(self) -> Bar | None:
        return self.bars[-1] if self.bars else None


@dataclass
class FilterResult:
    key: str
    label: str
    passed: bool
    value: Any = None
    threshold: Any = None
    reason: str = ""


@dataclass
class StrategySignal:
    """What a strategy says about the latest bar of one stock."""

    triggered: bool
    reason: str
    factors: dict[str, float] = field(default_factory=dict)
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScreenRow:
    symbol: str
    name: str
    slug: str
    status: str
    last_date: str | None
    close: float | None
    triggered: bool
    eligible: bool
    selected: bool = False
    held: bool = False
    score: float | None = None
    rank: int | None = None
    stop: float | None = None
    shares: int | None = None
    notional: float | None = None
    capped_by: str | None = None
    entry_fee: float | None = None
    exit_fee: float | None = None
    round_trip_fees: float | None = None
    fee_pct_of_risk: float | None = None
    breakeven_pct: float | None = None
    worst_case_loss: float | None = None
    fee_warning: bool = False
    factors: dict[str, float | None] = field(default_factory=dict)
    detail: dict[str, Any] = field(default_factory=dict)
    filters: list[FilterResult] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


@dataclass
class ScreenResult:
    strategy: str
    strategy_label: str
    session_date: str
    expected_date: str
    universe: str
    looked_back_days: int
    equity: float
    rows: list[ScreenRow]
    summary: dict[str, int]
    warnings: list[str]
    config: dict[str, Any]
    generated_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "strategy_label": self.strategy_label,
            "session_date": self.session_date,
            "expected_date": self.expected_date,
            "universe": self.universe,
            "looked_back_days": self.looked_back_days,
            "equity": self.equity,
            "summary": self.summary,
            "warnings": self.warnings,
            "config": self.config,
            "generated_at": self.generated_at,
            "rows": [
                {
                    "symbol": row.symbol,
                    "name": row.name,
                    "slug": row.slug,
                    "status": row.status,
                    "last_date": row.last_date,
                    "close": row.close,
                    "triggered": row.triggered,
                    "eligible": row.eligible,
                    "selected": row.selected,
                    "held": row.held,
                    "score": row.score,
                    "rank": row.rank,
                    "stop": row.stop,
                    "shares": row.shares,
                    "notional": row.notional,
                    "capped_by": row.capped_by,
                    "entry_fee": row.entry_fee,
                    "exit_fee": row.exit_fee,
                    "round_trip_fees": row.round_trip_fees,
                    "fee_pct_of_risk": row.fee_pct_of_risk,
                    "breakeven_pct": row.breakeven_pct,
                    "worst_case_loss": row.worst_case_loss,
                    "fee_warning": row.fee_warning,
                    "factors": row.factors,
                    "detail": row.detail,
                    "filters": [
                        {
                            "key": item.key,
                            "label": item.label,
                            "passed": item.passed,
                            "value": item.value,
                            "threshold": item.threshold,
                            "reason": item.reason,
                        }
                        for item in row.filters
                    ],
                    "reasons": row.reasons,
                }
                for row in self.rows
            ],
        }
