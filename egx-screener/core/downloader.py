"""Shell bridge to the Node EGX100 downloader's `today` mode.

The downloader is streamed line-by-line so the web UI can show a real progress
bar instead of a spinner. The CLI can pass its own callback or ignore it.
"""

from __future__ import annotations

import os
import re
import shutil
import signal
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable

from .data import DATA_ROOT, DOWNLOADER_DIR, is_managed_data_dir
from .models import UniverseStock
from .strategy import Strategy

ProgressCallback = Callable[[dict[str, Any]], None]

_STOCK_LINE = re.compile(r"\[(\d+)/(\d+)\]\s+(.*)")
_MODE_LINE = re.compile(r"Mode:\s*today\s*·\s*(\d+)\s*stock")


class RefreshError(RuntimeError):
    """Raised when the Node downloader cannot produce a fresh local window."""


def clear_local_data(data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    for path in data_dir.glob("*-1d.json"):
        path.unlink(missing_ok=True)
    (data_dir / "manifest.json").unlink(missing_ok=True)


def _terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return

    # `start_new_session=True` puts pnpm, tsx, node, and Chromium in one
    # process group, so killing the group stops the whole download.
    if hasattr(os, "killpg"):
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            return
        except (ProcessLookupError, PermissionError, OSError):
            pass

    try:
        process.kill()
    except ProcessLookupError:
        pass


def refresh_strategy(
    strategy: Strategy,
    universe: list[UniverseStock],
    data_dir: Path,
    verbose: bool = False,
    progress: ProgressCallback | None = None,
) -> str:
    """Fetch a clean window for the strategy and overwrite its local folder."""

    if not is_managed_data_dir(data_dir):
        raise RefreshError(
            f"Refusing to refresh {data_dir}: the screener only writes under "
            f"{DATA_ROOT}. Use --data-dir without --refresh for offline reads."
        )

    if not DOWNLOADER_DIR.exists():
        raise RefreshError(
            f"Downloader not found at {DOWNLOADER_DIR}. "
            "This side project expects the TradeReplay repository layout."
        )

    if not (DOWNLOADER_DIR / "node_modules" / "tsx").exists():
        raise RefreshError(
            "The Node downloader dependencies are not installed. Run "
            f"`cd {DOWNLOADER_DIR} && pnpm install` first."
        )

    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise RefreshError(
            "pnpm was not found on PATH. Install pnpm or run the downloader "
            "manually from tools/egx100-downloader."
        )

    clear_local_data(data_dir)

    command = [
        pnpm,
        "exec",
        "tsx",
        "src/cli.ts",
        "download",
        "--mode",
        "today",
        "--days",
        str(strategy.meta.lookback_days),
        "--output",
        str(data_dir),
        "--symbols",
        ",".join(stock.slug for stock in universe),
    ]
    if verbose:
        command.append("--verbose")

    timeout_seconds = min(1800, max(300, len(universe) * 30))

    def emit(event: dict[str, Any]) -> None:
        if progress is None:
            return
        try:
            progress(event)
        except Exception:  # noqa: BLE001 - never let a UI callback stop a refresh
            pass

    emit(
        {
            "phase": "refreshing",
            "message": "Starting downloader…",
            "current": 0,
            "total": len(universe),
        }
    )

    try:
        process = subprocess.Popen(
            command,
            cwd=DOWNLOADER_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            start_new_session=True,
        )
    except OSError as cause:
        raise RefreshError(f"Could not start the downloader: {cause}") from cause

    output_lines: list[str] = []
    counters = {"current": 0, "total": len(universe)}

    def reader() -> None:
        if process.stdout is None:  # pragma: no cover - PIPE is always set
            return

        for raw in process.stdout:
            line = raw.rstrip("\n")
            output_lines.append(line)

            stock_match = _STOCK_LINE.search(line)
            if stock_match is not None:
                counters["current"] = int(stock_match.group(1))
                counters["total"] = int(stock_match.group(2))
                emit(
                    {
                        "phase": "refreshing",
                        "message": stock_match.group(3).strip(),
                        "current": counters["current"],
                        "total": counters["total"],
                        "line": line,
                    }
                )
                continue

            mode_match = _MODE_LINE.search(line)
            if mode_match is not None:
                counters["total"] = int(mode_match.group(1))
                emit(
                    {
                        "phase": "refreshing",
                        "message": "Fetching daily bars…",
                        "current": counters["current"],
                        "total": counters["total"],
                        "line": line,
                    }
                )
                continue

            if line.startswith("Done ·"):
                counters["current"] = counters["total"]
                emit(
                    {
                        "phase": "refreshing",
                        "message": "Downloader finished",
                        "current": counters["current"],
                        "total": counters["total"],
                        "line": line,
                    }
                )
                continue

            if line.strip():
                emit(
                    {
                        "phase": "refreshing",
                        "current": counters["current"],
                        "total": counters["total"],
                        "line": line,
                    }
                )

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()

    try:
        returncode = process.wait(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as cause:
        _terminate_process(process)
        raise RefreshError(
            f"Downloader timed out after {timeout_seconds}s. "
            "Check the Investing.com session and retry."
        ) from cause

    thread.join(timeout=5)
    output = "\n".join(output_lines)

    if returncode != 0:
        tail = "\n".join(output.strip().splitlines()[-20:])
        raise RefreshError(
            "Downloader failed. If the session is expired, run "
            f"`cd {DOWNLOADER_DIR} && pnpm auth`.\n\n{tail}"
        )

    if not list(data_dir.glob("*-1d.json")):
        raise RefreshError(
            "Downloader completed but wrote no bars for the requested window. "
            "This usually means there is no EGX session today (weekend/holiday), "
            "the market has not published today's close yet, or the session "
            "expired. Run after the EGX close and retry."
        )

    return output
