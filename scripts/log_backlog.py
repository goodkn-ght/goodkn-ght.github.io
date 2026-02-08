#!/usr/bin/env python3
"""Append heartbeat backlog entries to data/backlog.json.

Usage:
    ./scripts/log_backlog.py --heartbeat 11 --backlog 4 --note "Prep backlog graph"
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKLOG_PATH = ROOT / "data" / "backlog.json"


def load() -> dict:
    if not BACKLOG_PATH.exists():
        return {"backlogHistory": []}
    return json.loads(BACKLOG_PATH.read_text())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--heartbeat", type=int, required=True)
    parser.add_argument("--backlog", type=int, required=True)
    parser.add_argument("--note", required=True)
    parser.add_argument("--timestamp", help="ISO timestamp (default: now UTC)")
    args = parser.parse_args()

    data = load()
    history = data.setdefault("backlogHistory", [])
    entry = {
        "heartbeat": args.heartbeat,
        "timestamp": args.timestamp or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "backlog": args.backlog,
        "notes": args.note
    }
    history.append(entry)
    BACKLOG_PATH.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Logged backlog entry: {entry}")


if __name__ == "__main__":
    main()
