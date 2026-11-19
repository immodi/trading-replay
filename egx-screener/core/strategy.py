"""Strategy plug-in contract and registry.

Adding a strategy means dropping a module in `egx-screener/strategies/` that
implements `Strategy` and calling `register(...)` at import time. The screener
never imports a concrete strategy directly; it asks the registry by key.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from .indicators import Series
from .models import Stock, StrategySignal


@dataclass(frozen=True)
class StrategyMeta:
    key: str
    label: str
    description: str
    exit_description: str
    exit_short: str
    universe: str | list[str]
    lookback_days: int
    min_bars: int
    stop_pct: float
    max_hold_bars: int


@runtime_checkable
class Strategy(Protocol):
    meta: StrategyMeta

    def evaluate(
        self,
        stock: Stock,
        indicators: dict[str, Series],
        index: int,
    ) -> StrategySignal:
        """Return the signal for one completed bar."""

    def exit_signal(
        self,
        stock: Stock,
        indicators: dict[str, Series],
        index: int,
    ) -> bool:
        """Return True when an open position should exit at the next open."""


_REGISTRY: dict[str, Strategy] = {}


def register(strategy: Strategy) -> Strategy:
    key = strategy.meta.key
    if key in _REGISTRY:
        raise ValueError(f"Strategy '{key}' is already registered.")
    _REGISTRY[key] = strategy
    return strategy


def get_strategy(key: str) -> Strategy:
    _load_builtin_strategies()
    if key not in _REGISTRY:
        available = ", ".join(sorted(_REGISTRY)) or "(none)"
        raise KeyError(f"Unknown strategy '{key}'. Available: {available}")
    return _REGISTRY[key]


def list_strategies() -> list[Strategy]:
    _load_builtin_strategies()
    return sorted(_REGISTRY.values(), key=lambda item: item.meta.label)


_LOADED = False


def _load_builtin_strategies() -> None:
    global _LOADED
    if _LOADED:
        return

    from strategies import donchian, ema_cross  # noqa: F401

    _LOADED = True
