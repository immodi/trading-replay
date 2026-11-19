#!/usr/bin/env python3
"""CLI entry point for the EGX daily screener.

Examples
--------
Refresh from Investing.com and screen today's close::

    python3 egx-screener/screen.py --strategy donchian --refresh

Screen the already-downloaded local window without touching the network::

    python3 egx-screener/screen.py --strategy donchian

Print machine-readable JSON::

    python3 egx-screener/screen.py --strategy donchian --json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

TOOL_ROOT = Path(__file__).resolve().parent
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))

from core.data import (  # noqa: E402
    DATA_ROOT,
    DataError,
    NoSessionError,
    data_dir_for,
    is_managed_data_dir,
    parse_date,
    resolve_universe,
    today_utc,
)
from core.downloader import RefreshError, refresh_strategy  # noqa: E402
from core.screener import ScreenOptions, run_screen  # noqa: E402
from core.strategy import get_strategy  # noqa: E402
from core.universes import UniverseError, refresh_universes  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Screen the EGX30 (or another universe) on the latest close."
    )
    parser.add_argument(
        "--strategy",
        default="donchian",
        help="Strategy key (default: donchian).",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Run the Node downloader's today mode before screening.",
    )
    parser.add_argument(
        "--refresh-names",
        action="store_true",
        help=(
            "Refresh the EGX30/EGX100 constituent lists from Investing.com "
            "before screening."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the full screen result as JSON.",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Also write the JSON result to egx-screener/out/.",
    )
    parser.add_argument(
        "--equity",
        type=float,
        default=None,
        help="Account equity in EGP for reference position sizing.",
    )
    parser.add_argument(
        "--fixed-fee",
        type=float,
        default=None,
        help="Fixed broker fee per order per side, in EGP.",
    )
    parser.add_argument(
        "--cost-pct",
        type=float,
        default=None,
        help="Percentage fee per side (e.g. 0.003 for 0.30%%).",
    )
    parser.add_argument(
        "--held",
        default="",
        help="Comma-separated symbols already held (excluded from selection).",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Override the local data directory (offline/testing).",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="Expected session date (YYYY-MM-DD). Defaults to today UTC.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Pass --verbose to the Node downloader.",
    )
    return parser.parse_args(argv)


def fmt(value: object, digits: int = 2, suffix: str = "") -> str:
    if value is None:
        return "-"
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return f"{value:,}{suffix}"
    try:
        return f"{float(value):,.{digits}f}{suffix}"
    except (TypeError, ValueError):
        return str(value)


def print_table(result) -> None:
    print()
    print(f"{result.strategy_label}  ·  {result.universe}")
    print(
        f"Session {result.session_date}  ·  looked back {result.looked_back_days} days  ·  "
        f"equity {result.equity:,.0f} EGP"
    )
    summary = result.summary
    print(
        "Universe {universe} · loaded {loaded} · missing {missing} · fresh {fresh} · "
        "eligible {eligible} · triggered {triggered} · selected {selected} · "
        "fee warnings {fee_warnings}".format(**summary)
    )
    if result.warnings:
        for warning in result.warnings:
            print(f"warning: {warning}")
    print()

    headers = [
        "#",
        "Symbol",
        "Close",
        "PriorHigh",
        "BrkATR",
        "Vol x",
        "RS60%",
        "ATR%",
        "Score",
        "Stop",
        "Shares",
        "Fees",
        "Fee/Risk",
        "Status",
    ]
    widths = [3, 7, 9, 10, 7, 7, 8, 7, 7, 9, 8, 7, 8, 14]

    def line(values: list[str]) -> str:
        return "  ".join(value.rjust(width) for value, width in zip(values, widths))

    print(line(headers))
    print("  ".join("-" * width for width in widths))

    for row in result.rows:
        factors = row.factors
        detail = row.detail
        status = "SELECTED" if row.selected else row.status.replace("_", " ")
        if row.fee_warning:
            status = f"{status} · FEE"
        print(
            line(
                [
                    fmt(row.rank, 0),
                    row.symbol,
                    fmt(row.close, 2),
                    fmt(detail.get("prior_high"), 2),
                    fmt(factors.get("breakout_atr"), 2),
                    fmt(factors.get("volume_ratio"), 2),
                    fmt(
                        None
                        if factors.get("rs60") is None
                        else float(factors["rs60"]) * 100.0,
                        1,
                    ),
                    fmt(
                        None
                        if factors.get("atr_pct") is None
                        else float(factors["atr_pct"]) * 100.0,
                        1,
                    ),
                    fmt(row.score, 3),
                    fmt(row.stop, 2),
                    fmt(row.shares, 0),
                    fmt(row.round_trip_fees, 2),
                    fmt(
                        None
                        if row.fee_pct_of_risk is None
                        else row.fee_pct_of_risk * 100.0,
                        1,
                    ),
                    status,
                ]
            )
        )

    selected = [row for row in result.rows if row.selected]
    if selected:
        print()
        print("Next-open orders (reference size at today's close):")
        for row in selected:
            print(
                f"  {row.rank}. {row.symbol:<6} close {row.close:.2f}  "
                f"stop {row.stop:.2f}  shares {row.shares:,}  "
                f"notional {row.notional:,.0f} EGP  "
                f"fees {row.round_trip_fees:,.2f} EGP "
                f"({row.fee_pct_of_risk * 100:.1f}% of risk, "
                f"break-even {row.breakeven_pct * 100:.2f}%)"
            )
            if row.fee_warning:
                print(
                    "     warning: fee drag is high for this account size; "
                    "the win can be largely consumed by costs."
                )
    print()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        strategy = get_strategy(args.strategy)
        data_dir = args.data_dir or data_dir_for(strategy.meta.key)

        def cli_progress(event: dict) -> None:
            message = event.get("message")
            if not message:
                return
            current = int(event.get("current") or 0)
            total = int(event.get("total") or 0)
            prefix = f"{current}/{total} " if total else ""
            print(
                f"\r  {prefix}{str(message)[:80]}",
                end="",
                file=sys.stderr,
                flush=True,
            )

        if args.refresh_names:
            print(
                "Refreshing EGX30/EGX100 names from Investing.com …",
                file=sys.stderr if args.json else sys.stdout,
                flush=True,
            )
            refresh_universes(progress=cli_progress)
            print(file=sys.stderr)

        if args.refresh:
            if not is_managed_data_dir(data_dir):
                raise RefreshError(
                    f"Refusing to refresh {data_dir}: the screener only writes "
                    f"under {DATA_ROOT}. Use --data-dir without --refresh for "
                    "offline reads."
                )
            _, universe = resolve_universe(strategy.meta.universe)
            print(
                f"Refreshing {strategy.meta.lookback_days} days for "
                f"{len(universe)} stock(s) into {data_dir} …",
                file=sys.stderr if args.json else sys.stdout,
                flush=True,
            )

            output = refresh_strategy(
                strategy=strategy,
                universe=universe,
                data_dir=data_dir,
                verbose=args.verbose,
                progress=cli_progress,
            )
            print(file=sys.stderr)
            if args.verbose:
                print(output, file=sys.stderr if args.json else sys.stdout)

        expected: date | None = parse_date(args.date) if args.date else today_utc()
        held = [item for item in args.held.split(",") if item.strip()]

        overrides: dict[str, float] = {}
        if args.fixed_fee is not None:
            overrides["fixed_fee_per_order"] = max(0.0, args.fixed_fee)
        if args.cost_pct is not None:
            overrides["cost_pct_per_side"] = max(0.0, args.cost_pct)

        result = run_screen(
            ScreenOptions(
                strategy_key=args.strategy,
                data_dir=data_dir,
                expected_date=expected,
                equity=args.equity,
                held=held,
                config_overrides=overrides,
            )
        )

        if args.json:
            print(json.dumps(result.to_dict(), indent=2))
        else:
            print_table(result)

        if args.save:
            from core.data import OUT_DIR

            OUT_DIR.mkdir(parents=True, exist_ok=True)
            path = OUT_DIR / f"{result.strategy}-{result.session_date}.json"
            path.write_text(
                json.dumps(result.to_dict(), indent=2),
                encoding="utf-8",
            )
            print(
                f"Saved {path}",
                file=sys.stderr if args.json else sys.stdout,
            )

        return 0

    except (
        DataError,
        NoSessionError,
        RefreshError,
        UniverseError,
        KeyError,
    ) as cause:
        print(f"error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
