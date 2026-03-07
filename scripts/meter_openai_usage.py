#!/usr/bin/env python3
"""Fetch OpenAI usage+cost from the gateway and emit data/usage.json."""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "usage.json"


def fetch_gateway_usage(days: int = 31) -> dict:
    cmd = ["openclaw", "gateway", "usage-cost", "--json", "--days", str(days)]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=30)
    return json.loads(result.stdout)


def main() -> None:
    payload = fetch_gateway_usage()
    updated_at = datetime.fromtimestamp(payload["updatedAt"] / 1000, tz=timezone.utc)

    usage = {
        "updated_at": updated_at.isoformat(),
        "window_days": payload.get("days", 0),
        "totals": {
            "tokens": payload["totals"].get("totalTokens", 0),
            "usd": round(payload["totals"].get("totalCost", 0.0), 4),
        },
        "daily": [
            {
                "date": entry.get("date"),
                "tokens": entry.get("totalTokens", 0),
                "usd": round(entry.get("totalCost", 0.0), 4),
                "input_tokens": entry.get("input", 0),
                "output_tokens": entry.get("output", 0),
                "cache_tokens": entry.get("cacheRead", 0),
            }
            for entry in payload.get("daily", [])
        ],
    }

    OUTPUT_PATH.write_text(json.dumps(usage, indent=2) + "\n")
    print(f"Updated usage snapshot from gateway → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
