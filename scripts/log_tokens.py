#!/usr/bin/env python3
"""Append token usage snapshots.

Usage:
    ./scripts/log_tokens.py --tokens-in 238000 --tokens-out 233
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS_PATH = ROOT / "data" / "tokens.json"


def load() -> dict:
    if TOKENS_PATH.exists():
        return json.loads(TOKENS_PATH.read_text())
    return {"entries": []}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tokens-in", type=int, required=True)
    parser.add_argument("--tokens-out", type=int, required=True)
    parser.add_argument("--timestamp", help="ISO timestamp (default: now UTC)")
    args = parser.parse_args()

    data = load()
    entries = data.setdefault("entries", [])
    previous = entries[-1] if entries else None

    entry = {
        "timestamp": args.timestamp or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "tokensIn": args.tokens_in,
        "tokensOut": args.tokens_out,
    }

    if previous:
        entry["deltaIn"] = args.tokens_in - previous.get("tokensIn", 0)
        entry["deltaOut"] = args.tokens_out - previous.get("tokensOut", 0)
    else:
        entry["deltaIn"] = args.tokens_in
        entry["deltaOut"] = args.tokens_out

    entries.append(entry)
    TOKENS_PATH.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Logged tokens: {entry}")


if __name__ == "__main__":
    main()
