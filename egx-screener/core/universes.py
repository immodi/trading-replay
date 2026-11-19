"""Live index-name refresh, driven by the Node Investing.com pipeline.

The Node downloader owns component discovery and ticker resolution. This module
builds a slug -> ticker map from the current universes/manifests, asks the Node
`universe` command for each index, and rewrites the universe JSON files.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .data import (
    DATA_ROOT,
    DOWNLOADER_DIR,
    OUT_DIR,
    REPO_ROOT,
    UNIVERSES_DIR,
)

ProgressCallback = Callable[[dict[str, Any]], None]

INDEX_LABELS = {"egx30": "EGX 30", "egx100": "EGX 100"}
INDEX_TIMEOUTS = {"egx30": 600, "egx100": 1200}


class UniverseError(RuntimeError):
    """Raised when the Node universe pipeline cannot refresh the names."""


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _read_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _emit(progress: ProgressCallback | None, event: dict[str, Any]) -> None:
    if progress is None:
        return
    try:
        progress(event)
    except Exception:  # noqa: BLE001 - never let a UI callback stop the job
        pass


def known_ticker_map() -> dict[str, str]:
    """Merge slug -> ticker from the universe files and downloader manifests."""

    mapping: dict[str, str] = {}

    def add_payload(payload: dict | None) -> None:
        if payload is None:
            return
        stocks = payload.get("stocks")
        if not isinstance(stocks, list):
            return
        for stock in stocks:
            if not isinstance(stock, dict):
                continue
            slug = stock.get("slug")
            symbol = stock.get("symbol")
            if isinstance(slug, str) and isinstance(symbol, str):
                if slug and symbol:
                    mapping[slug] = symbol

    for index in ("egx100", "egx30"):
        add_payload(_read_json(UNIVERSES_DIR / f"{index}.json"))

    # The Node downloader's own manifest is the best ticker map when present.
    add_payload(_read_json(REPO_ROOT / "data" / "egx100" / "manifest.json"))
    for manifest in DATA_ROOT.glob("*/manifest.json"):
        add_payload(_read_json(manifest))

    return mapping


def _write_known_map(mapping: dict[str, str]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "known-universe.json"
    path.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    return path


def _run_universe_command(index: str, known_file: Path) -> dict:
    if not DOWNLOADER_DIR.exists():
        raise UniverseError(
            f"Downloader not found at {DOWNLOADER_DIR}. "
            "This side project expects the TradeReplay repository layout."
        )

    if not (DOWNLOADER_DIR / "node_modules" / "tsx").exists():
        raise UniverseError(
            "The Node downloader dependencies are not installed. Run "
            f"`cd {DOWNLOADER_DIR} && pnpm install` first."
        )

    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise UniverseError("pnpm was not found on PATH.")

    command = [
        pnpm,
        "exec",
        "tsx",
        "src/cli.ts",
        "universe",
        "--index",
        index,
        "--json",
        "--known",
        str(known_file),
    ]
    timeout_seconds = INDEX_TIMEOUTS.get(index, 900)

    try:
        completed = subprocess.run(
            command,
            cwd=DOWNLOADER_DIR,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as cause:
        raise UniverseError(
            f"Universe refresh timed out after {timeout_seconds}s for {index}."
        ) from cause
    except OSError as cause:
        raise UniverseError(
            f"Could not start the universe refresh: {cause}"
        ) from cause

    if completed.returncode != 0:
        tail = "\n".join(
            ((completed.stdout or "") + (completed.stderr or "")).strip().splitlines()[-20:]
        )
        raise UniverseError(
            f"Universe refresh failed for {index}. If the session is expired, "
            f"run `cd {DOWNLOADER_DIR} && pnpm auth`.\n\n{tail}"
        )

    text = (completed.stdout or "").strip()
    if not text:
        raise UniverseError(f"The universe command returned no JSON for {index}.")

    # The Node command prints one JSON document on stdout. If a stray log line
    # slipped through, start at the first object brace.
    start = text.find("{")
    if start < 0:
        raise UniverseError(f"The universe command returned invalid JSON for {index}.")
    try:
        payload = json.loads(text[start:])
    except json.JSONDecodeError as cause:
        raise UniverseError(
            f"The universe command returned invalid JSON for {index}: {cause}"
        ) from cause

    if not isinstance(payload, dict) or not isinstance(payload.get("stocks"), list):
        raise UniverseError(f"The universe command returned an unexpected payload for {index}.")
    return payload


def _company_key(name: str) -> str:
    """Collapse dual-line names such as 'Valmore Holding A' to one company.

    The EGX30 components list can include two lines for the same company. The
    primary line comes first; keep that one and drop the single-letter class
    suffix line.
    """

    parts = name.strip().rsplit(" ", 1)
    if len(parts) == 2 and len(parts[1]) == 1 and parts[1].isalpha():
        return parts[0].strip().lower()
    return name.strip().lower()


def _write_universe(index: str, payload: dict) -> dict:
    path = UNIVERSES_DIR / f"{index}.json"
    previous = _read_json(path) or {}
    previous_stocks = previous.get("stocks")
    previous_symbols = {
        stock.get("symbol")
        for stock in previous_stocks or []
        if isinstance(stock, dict) and isinstance(stock.get("symbol"), str)
    }

    stocks: list[dict[str, str]] = []
    seen_slugs: set[str] = set()
    seen_companies: set[str] = set()

    for stock in payload.get("stocks", []):
        if not isinstance(stock, dict):
            continue
        symbol = stock.get("symbol")
        name = stock.get("name")
        slug = stock.get("slug")
        if not (
            isinstance(symbol, str)
            and isinstance(name, str)
            and isinstance(slug, str)
            and symbol
            and slug
        ):
            continue
        if slug in seen_slugs:
            continue

        if index == "egx30":
            key = _company_key(name)
            if key in seen_companies:
                continue
            seen_companies.add(key)

        seen_slugs.add(slug)
        stocks.append({"symbol": symbol, "name": name, "slug": slug})

    if not stocks:
        raise UniverseError(f"The live {index} list was empty; refusing to overwrite {path}.")

    symbols = {stock["symbol"] for stock in stocks}
    added = sorted(symbols - previous_symbols)
    removed = sorted(previous_symbols - symbols)

    document = {
        "key": index,
        "label": INDEX_LABELS.get(index, index.upper()),
        "source": payload.get("source", "Investing.com components"),
        "updatedAt": payload.get("generatedAt") or _now_iso(),
        "count": len(stocks),
        "stocks": stocks,
    }
    path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    warnings = payload.get("warnings")
    return {
        "index": index,
        "count": len(stocks),
        "added": added,
        "removed": removed,
        "warnings": warnings if isinstance(warnings, list) else [],
        "updatedAt": document["updatedAt"],
    }


def refresh_universes(
    progress: ProgressCallback | None = None,
) -> dict[str, dict]:
    """Refresh egx100.json and egx30.json from the live Investing.com lists."""

    known = known_ticker_map()
    known_file = _write_known_map(known)

    results: dict[str, dict] = {}
    for index in ("egx100", "egx30"):
        _emit(
            progress,
            {
                "phase": "names",
                "message": f"Fetching live {INDEX_LABELS[index]} components…",
                "current": 0,
                "total": 0,
            },
        )
        payload = _run_universe_command(index, known_file)
        results[index] = _write_universe(index, payload)
        if results[index]["warnings"]:
            _emit(
                progress,
                {
                    "phase": "names",
                    "message": (
                        f"{len(results[index]['warnings'])} "
                        f"{INDEX_LABELS[index]} name(s) could not be resolved."
                    ),
                    "current": 0,
                    "total": 0,
                },
            )

    _emit(
        progress,
        {
            "phase": "names",
            "message": "Index names updated.",
            "current": 0,
            "total": 0,
        },
    )
    return results
