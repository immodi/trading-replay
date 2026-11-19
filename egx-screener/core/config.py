"""Screener configuration: defaults plus the editable `config.json`."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from .data import TOOL_ROOT

CONFIG_PATH = TOOL_ROOT / "config.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "min_history_bars": 60,
    "min_price": 1.0,
    "min_median_traded_value_20d": 2_000_000,
    "risk_per_trade": 0.01,
    "max_order_notional": 1_000_000,
    # EGX broker default: EGP 2 + 0.1% per executed buy or sell order.
    "cost_pct_per_side": 0.001,
    "fixed_fee_per_order": 2.0,
    "fee_warning_threshold": 0.25,
    "equity": 100_000,
    "max_new_per_day": 3,
    "max_positions": 12,
    "ranking_weights": {
        "breakout_atr": 0.5,
        "cross_strength": 0.3,
        "volume_ratio": 0.2,
        "rs60": 0.2,
        "trend_flag": 0.1,
        "atr_pct": -0.3,
    },
}


def load_config(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    config = deepcopy(DEFAULT_CONFIG)

    if CONFIG_PATH.exists():
        try:
            loaded = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as cause:
            raise RuntimeError(f"Could not read {CONFIG_PATH}: {cause}") from cause
        if not isinstance(loaded, dict):
            raise RuntimeError(f"{CONFIG_PATH} must contain a JSON object.")
        config.update(loaded)

    if overrides:
        for key, value in overrides.items():
            if value is not None:
                config[key] = value

    weights = config.get("ranking_weights")
    if not isinstance(weights, dict):
        raise RuntimeError("config.ranking_weights must be an object.")
    config["ranking_weights"] = {
        str(key): float(value) for key, value in weights.items()
    }

    return config
