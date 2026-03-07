#!/usr/bin/env python3
"""Aggregate OpenAI usage from OpenClaw session logs into data/usage.json."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parents[1]
SESSION_DIR = Path.home() / ".openclaw" / "agents" / "main" / "sessions"
OUTPUT_PATH = ROOT / "data" / "usage.json"

# Rough per-token USD assumptions until OpenMeter pipeline is in place
MODEL_RATES_USD_PER_TOKEN: Dict[str, float] = {
    "gpt-5.1-codex": 0.0000357,  # ≈$3.27 per 91.7k tokens observed today
}
DEFAULT_RATE = 0.00004
IGNORED_SUFFIXES = {".lock", ".reset", ".deleted"}


def iter_session_files():
    for path in sorted(SESSION_DIR.glob("*.jsonl*")):
        if any(path.name.endswith(sfx) for sfx in IGNORED_SUFFIXES):
            continue
        yield path


def iter_usage_events():
    for path in iter_session_files():
        try:
            with path.open() as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    message = record.get("message") or {}
                    usage = message.get("usage") or {}
                    total = usage.get("totalTokens")
                    if not total or total <= 0:
                        continue
                    ts = record.get("timestamp") or message.get("timestamp")
                    model = message.get("model") or "unknown"
                    yield {
                        "timestamp": ts,
                        "model": model,
                        "tokens": total,
                    }
        except FileNotFoundError:
            continue


def tokens_to_usd(model: str, tokens: int) -> float:
    rate = MODEL_RATES_USD_PER_TOKEN.get(model, DEFAULT_RATE)
    return tokens * rate


def main() -> None:
    totals = {"tokens": 0, "usd": 0.0}
    by_model: Dict[str, Dict[str, float]] = defaultdict(lambda: {"tokens": 0, "usd": 0.0})
    by_day: Dict[str, Dict[str, float]] = defaultdict(lambda: {"tokens": 0, "usd": 0.0})

    for event in iter_usage_events():
        tokens = int(event["tokens"])
        model = event["model"]
        usd = tokens_to_usd(model, tokens)
        totals["tokens"] += tokens
        totals["usd"] += usd
        by_model[model]["tokens"] += tokens
        by_model[model]["usd"] += usd
        try:
            dt = datetime.fromtimestamp(event["timestamp"], timezone.utc)
        except Exception:
            dt = datetime.now(timezone.utc)
        day_key = dt.date().isoformat()
        by_day[day_key]["tokens"] += tokens
        by_day[day_key]["usd"] += usd

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "tokens": totals["tokens"],
            "usd": round(totals["usd"], 4),
        },
        "by_model": [
            {
                "model": model,
                "tokens": data["tokens"],
                "usd": round(data["usd"], 4),
            }
            for model, data in sorted(by_model.items(), key=lambda item: item[1]["tokens"], reverse=True)
        ],
        "daily": [
            {
                "date": day,
                "tokens": data["tokens"],
                "usd": round(data["usd"], 4),
            }
            for day, data in sorted(by_day.items())
        ],
    }

    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote usage snapshot → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
