#!/usr/bin/env python3
"""Small standard-library HTTP server for the EGX daily screener.

Run::

    python3 egx-screener/server.py

Then open http://127.0.0.1:8787. The server never runs the downloader on its
own; the page's Refresh button posts to `/api/refresh`.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from datetime import date, datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

TOOL_ROOT = Path(__file__).resolve().parent
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))

from core.data import (  # noqa: E402
    DataError,
    NoSessionError,
    data_dir_for,
    parse_date,
    resolve_universe,
)
from core.downloader import refresh_strategy  # noqa: E402
from core.screener import ScreenOptions, run_screen  # noqa: E402
from core.strategy import get_strategy, list_strategies  # noqa: E402
from core.universes import refresh_universes  # noqa: E402

WEB_DIR = TOOL_ROOT / "web"

STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
}


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class RefreshState:
    """Thread-safe state for the background refresh job."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.active = False
        self.phase = "idle"
        self.message = "Idle"
        self.current = 0
        self.total = 0
        self.started_at: str | None = None
        self.finished_at: str | None = None
        self.error: str | None = None
        self.result: dict | None = None
        self.log_tail: list[str] = []

    def start(self, total: int) -> bool:
        with self._lock:
            if self.active:
                return False
            self.active = True
            self.phase = "refreshing"
            self.message = "Starting refresh…"
            self.current = 0
            self.total = total
            self.started_at = now_iso()
            self.finished_at = None
            self.error = None
            self.result = None
            self.log_tail = []
            return True

    def progress(self, event: dict) -> None:
        with self._lock:
            self.phase = str(event.get("phase", self.phase))
            message = event.get("message")
            if message:
                self.message = str(message)
            self.current = int(event.get("current", self.current) or 0)
            self.total = int(event.get("total", self.total) or 0)
            line = event.get("line")
            if line:
                self.log_tail = (self.log_tail + [str(line)])[-6:]

    def screening(self) -> None:
        with self._lock:
            self.phase = "screening"
            self.message = "Running the screen…"
            self.current = self.total

    def done(self, result: dict) -> None:
        with self._lock:
            self.active = False
            self.phase = "done"
            self.message = "Screen updated"
            self.result = result
            self.finished_at = now_iso()
            self.current = self.total

    def done_names(self, message: str) -> None:
        with self._lock:
            self.active = False
            self.phase = "done"
            self.message = message
            self.result = None
            self.finished_at = now_iso()
            self.current = self.total

    def fail(self, message: str) -> None:
        with self._lock:
            self.active = False
            self.phase = "error"
            self.message = "Refresh failed"
            self.error = message
            self.finished_at = now_iso()

    def snapshot(self, include_result: bool = True) -> dict:
        with self._lock:
            percent = (100.0 * self.current / self.total) if self.total else 0.0
            return {
                "active": self.active,
                "phase": self.phase,
                "message": self.message,
                "current": self.current,
                "total": self.total,
                "percent": round(max(0.0, min(100.0, percent)), 1),
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "error": self.error,
                "log_tail": list(self.log_tail),
                "result": (
                    self.result
                    if include_result and self.phase == "done"
                    else None
                ),
            }


REFRESH_STATE = RefreshState()


def strategy_payload() -> list[dict]:
    return [
        {
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
        for strategy in list_strategies()
    ]


def screen_from_params(params: dict[str, list[str]] | dict[str, str]) -> dict:
    def one(key: str, default: str | None = None) -> str | None:
        value = params.get(key)  # type: ignore[arg-type]
        if isinstance(value, list):
            return value[0] if value else default
        return value if value is not None else default

    strategy_key = one("strategy", "donchian") or "donchian"
    equity_raw = one("equity")
    held_raw = one("held", "") or ""
    date_raw = one("date")

    expected: date | None = None
    if date_raw:
        expected = parse_date(date_raw)

    equity: float | None = None
    if equity_raw:
        try:
            equity = float(equity_raw)
        except ValueError as cause:
            raise DataError(
                f"equity must be a number, got '{equity_raw}'."
            ) from cause

    overrides: dict[str, float] = {}
    fixed_fee_raw = one("fixed_fee")
    if fixed_fee_raw not in (None, ""):
        try:
            overrides["fixed_fee_per_order"] = max(0.0, float(fixed_fee_raw))
        except ValueError as cause:
            raise DataError(
                f"fixed_fee must be a number, got '{fixed_fee_raw}'."
            ) from cause

    # The UI sends the percentage in percent (0.1 = 0.1%); `cost_pct` is the
    # fraction form used by the CLI (0.001 = 0.1%).
    fee_pct_raw = one("fee_pct")
    if fee_pct_raw not in (None, ""):
        try:
            overrides["cost_pct_per_side"] = (
                max(0.0, float(fee_pct_raw)) / 100.0
            )
        except ValueError as cause:
            raise DataError(
                f"fee_pct must be a number, got '{fee_pct_raw}'."
            ) from cause

    cost_pct_raw = one("cost_pct")
    if cost_pct_raw not in (None, ""):
        try:
            overrides["cost_pct_per_side"] = max(0.0, float(cost_pct_raw))
        except ValueError as cause:
            raise DataError(
                f"cost_pct must be a number, got '{cost_pct_raw}'."
            ) from cause

    return run_screen(
        ScreenOptions(
            strategy_key=strategy_key,
            equity=equity,
            held=[item for item in held_raw.split(",") if item.strip()],
            expected_date=expected,
            config_overrides=overrides,
        )
    ).to_dict()


def _strategy_key(params: dict) -> str:
    value = params.get("strategy", "donchian")
    if isinstance(value, list):
        return str(value[0]) if value else "donchian"
    return str(value or "donchian")


def _truthy(value) -> bool:
    if isinstance(value, list):
        value = value[0] if value else ""
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _run_refresh(params: dict) -> None:
    try:
        strategy = get_strategy(_strategy_key(params))
        names_only = _truthy(params.get("names_only"))
        refresh_names = _truthy(params.get("refresh_names")) or names_only

        if refresh_names:
            names_result = refresh_universes(progress=REFRESH_STATE.progress)
            summary = " · ".join(
                f"{key.upper()} {value.get('count', '?')}"
                for key, value in sorted(names_result.items())
            )
            warnings = sum(
                len(value.get("warnings", []))
                for value in names_result.values()
            )
            if warnings:
                summary += f" · {warnings} unresolved"

            if names_only:
                REFRESH_STATE.done_names(
                    f"Names updated: {summary}. "
                    "Click Refresh today to fetch bars for the new list."
                )
                return

            if summary:
                REFRESH_STATE.progress(
                    {
                        "phase": "names",
                        "message": f"Names updated: {summary}",
                        "current": 0,
                        "total": 0,
                        "line": f"Names updated: {summary}",
                    }
                )

        _, universe = resolve_universe(strategy.meta.universe)
        REFRESH_STATE.progress(
            {
                "phase": "refreshing",
                "message": "Preparing data…",
                "current": 0,
                "total": len(universe),
            }
        )
        refresh_strategy(
            strategy=strategy,
            universe=universe,
            data_dir=data_dir_for(strategy.meta.key),
            progress=REFRESH_STATE.progress,
        )
        REFRESH_STATE.screening()
        REFRESH_STATE.done(screen_from_params(params))
    except Exception as cause:  # noqa: BLE001
        REFRESH_STATE.fail(f"{type(cause).__name__}: {cause}")


class Handler(BaseHTTPRequestHandler):
    server_version = "EGXScreener/1.0"

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _error(self, status: int, message: str, **extra) -> None:
        self._json(status, {"ok": False, "error": message, **extra})

    def _screen(self, params) -> None:
        if REFRESH_STATE.active:
            self._error(
                HTTPStatus.CONFLICT,
                "A refresh is already running. Poll /api/refresh/status.",
                busy=True,
                status=REFRESH_STATE.snapshot(include_result=False),
            )
            return

        try:
            self._json(HTTPStatus.OK, {"ok": True, "result": screen_from_params(params)})
        except (NoSessionError, DataError) as cause:
            self._error(
                HTTPStatus.BAD_REQUEST,
                str(cause),
                needs_refresh=True,
            )
        except Exception as cause:  # noqa: BLE001 - surface a readable message
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, f"{type(cause).__name__}: {cause}")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)

        if parsed.path in STATIC_FILES:
            filename, content_type = STATIC_FILES[parsed.path]
            path = WEB_DIR / filename
            if not path.exists():
                self._error(HTTPStatus.NOT_FOUND, f"Missing {path}.")
                return
            self._send(HTTPStatus.OK, path.read_bytes(), content_type)
            return

        if parsed.path in {"/STRATEGY.md", "/donchian.md"}:
            name = parsed.path.lstrip("/")
            path = TOOL_ROOT / name
            self._send(
                HTTPStatus.OK,
                path.read_bytes() if path.exists() else f"{name} not found.".encode(),
                "text/plain; charset=utf-8",
            )
            return

        if parsed.path == "/api/strategies":
            self._json(HTTPStatus.OK, {"ok": True, "strategies": strategy_payload()})
            return

        if parsed.path == "/api/screen":
            self._screen(parse_qs(parsed.query))
            return

        if parsed.path == "/api/refresh/status":
            self._json(
                HTTPStatus.OK,
                {"ok": True, "status": REFRESH_STATE.snapshot()},
            )
            return

        if parsed.path == "/api/health":
            self._json(HTTPStatus.OK, {"ok": True})
            return

        self._error(HTTPStatus.NOT_FOUND, f"Unknown path {parsed.path}.")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/api/refresh":
            self._error(HTTPStatus.NOT_FOUND, f"Unknown path {parsed.path}.")
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except json.JSONDecodeError:
            self._error(HTTPStatus.BAD_REQUEST, "Request body must be JSON.")
            return

        params = {**parse_qs(parsed.query), **body}

        try:
            strategy = get_strategy(_strategy_key(params))
            _, universe = resolve_universe(strategy.meta.universe)
        except (KeyError, DataError) as cause:
            self._error(HTTPStatus.BAD_REQUEST, str(cause))
            return

        if not REFRESH_STATE.start(total=len(universe)):
            self._error(
                HTTPStatus.CONFLICT,
                "A refresh is already running. Poll /api/refresh/status.",
                busy=True,
                status=REFRESH_STATE.snapshot(include_result=False),
            )
            return

        threading.Thread(
            target=_run_refresh,
            args=(params,),
            daemon=True,
        ).start()

        self._json(
            HTTPStatus.ACCEPTED,
            {
                "ok": True,
                "status": REFRESH_STATE.snapshot(include_result=False),
            },
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve the EGX daily screener.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args(argv)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{args.host}:{args.port}"
    print(f"EGX screener: {url}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
