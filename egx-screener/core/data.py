"""Local data loading and universe resolution.

The screener never reads the main project's `data/` directory. Every strategy
owns a local folder under `egx-screener/data/<strategy-key>/`, populated by the
downloader's `today` mode and overwritten on each refresh.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

from .models import Bar, Stock, UniverseStock

TOOL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = TOOL_ROOT.parent
DOWNLOADER_DIR = REPO_ROOT / "tools" / "egx100-downloader"
UNIVERSES_DIR = TOOL_ROOT / "universes"
DATA_ROOT = TOOL_ROOT / "data"
OUT_DIR = TOOL_ROOT / "out"


class DataError(RuntimeError):
    """Raised when local data is missing or malformed."""


class NoSessionError(DataError):
    """Raised when the requested session date is not present in the data."""


def today_utc() -> date:
    return datetime.now(tz=timezone.utc).date()


def parse_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as cause:
        raise DataError(f"Expected a YYYY-MM-DD date, got '{value}'.") from cause


def data_dir_for(strategy_key: str) -> Path:
    return DATA_ROOT / strategy_key


def is_managed_data_dir(path: Path) -> bool:
    """True when `path` lives under the screener's own data root.

    This guard keeps `--refresh` from ever clearing the main project's `data/`
    directory, even when `--data-dir` is used for offline testing.
    """

    try:
        path.resolve().relative_to(DATA_ROOT.resolve())
        return True
    except ValueError:
        return False


def resolve_universe(
    spec: str | list[str],
) -> tuple[str, list[UniverseStock]]:
    """Resolve a named universe or an explicit list of symbols.

    A strategy can use `universe="egx30"`, `universe="egx100"`, or
    `universe=["COMI"]` for a single stock. Symbol lists are looked up in the
    broader EGX100 universe file.
    """

    if isinstance(spec, str):
        return load_universe(spec)

    symbols = [item.strip().upper() for item in spec if item.strip()]
    if not symbols:
        raise DataError("Strategy universe is an empty symbol list.")

    _, base = load_universe("egx100")
    by_symbol = {stock.symbol.upper(): stock for stock in base}
    missing = [symbol for symbol in symbols if symbol not in by_symbol]
    if missing:
        raise DataError(
            "Unknown symbols in strategy universe: " + ", ".join(missing)
        )

    label = "Custom (" + ", ".join(symbols) + ")"
    return label, [by_symbol[symbol] for symbol in symbols]


def load_universe(key: str) -> tuple[str, list[UniverseStock]]:
    path = UNIVERSES_DIR / f"{key}.json"
    if not path.exists():
        raise DataError(
            f"Unknown universe '{key}'. Expected {path}. "
            "Add a universes/<key>.json file or use 'egx30'."
        )

    payload = json.loads(path.read_text(encoding="utf-8"))
    label = str(payload.get("label", key))
    stocks = [
        UniverseStock(
            symbol=str(item["symbol"]),
            name=str(item.get("name", item["symbol"])),
            slug=str(item.get("slug", item["symbol"].lower())),
        )
        for item in payload.get("stocks", [])
    ]
    if not stocks:
        raise DataError(f"Universe '{key}' has no stocks.")
    return label, stocks


def load_bars(path: Path) -> list[Bar]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as cause:
        raise DataError(f"Could not read {path}: {cause}") from cause

    if not isinstance(raw, list):
        raise DataError(f"{path} must contain an array of bars.")

    seen: set[int] = set()
    bars: list[Bar] = []

    for row in raw:
        try:
            time = int(row["time"])
            open_ = float(row["open"])
            high = float(row["high"])
            low = float(row["low"])
            close = float(row["close"])
        except (KeyError, TypeError, ValueError):
            continue

        if time in seen:
            continue
        if min(open_, high, low, close) <= 0:
            continue

        volume_raw = row.get("volume", 0)
        try:
            volume = float(volume_raw)
        except (TypeError, ValueError):
            volume = 0.0
        if volume != volume or volume < 0:  # NaN
            volume = 0.0

        seen.add(time)
        bars.append(
            Bar(
                time=time,
                open=open_,
                high=max(open_, high, low, close),
                low=min(open_, high, low, close),
                close=close,
                volume=volume,
            )
        )

    bars.sort(key=lambda bar: bar.time)
    return bars


def load_stocks(
    data_dir: Path,
    universe: list[UniverseStock],
) -> tuple[list[Stock], list[UniverseStock]]:
    if not data_dir.exists():
        return [], list(universe)

    stocks: list[Stock] = []
    missing: list[UniverseStock] = []

    for item in universe:
        path = data_dir / f"{item.symbol}-1d.json"
        if not path.exists():
            missing.append(item)
            continue

        bars = load_bars(path)
        if not bars:
            missing.append(item)
            continue

        stocks.append(
            Stock(
                symbol=item.symbol,
                name=item.name,
                slug=item.slug,
                bars=bars,
            )
        )

    return stocks, missing


def session_date(stocks: list[Stock]) -> date | None:
    dates = [stock.last_bar.date for stock in stocks if stock.last_bar is not None]
    return max(dates) if dates else None


def validate_session(stocks: list[Stock], expected: date) -> date:
    latest = session_date(stocks)
    if latest is None:
        raise NoSessionError(
            "No local bars were found. Run a refresh first."
        )
    if latest != expected:
        raise NoSessionError(
            f"No EGX session data for {expected.isoformat()}; the latest local "
            f"session is {latest.isoformat()}. Run after the EGX close and "
            "refresh, or use the CLI's --date option to screen the latest "
            "available session deliberately."
        )
    return latest
