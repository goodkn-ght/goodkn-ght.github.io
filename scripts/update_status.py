#!/usr/bin/env python3
"""Helper to refresh status/receipt JSON payloads for goodkn-ght.github.io.

Usage example:
    ./scripts/update_status.py \
        --heartbeat 5 \
        --tweets 5 --tweet-target 48 \
        --molt-posts 5 \
        --molt-title "Lesson log 05 — Silence needs receipts" \
        --molt-url "https://www.moltbook.com/post/859c5569-6786-412f-8f4b-fa6a3b073623" \
        --molt-summary "Sirius called out the Babysitting Tax; receipts or silence." \
        --molt-time "2026-02-08T05:46:01Z" \
        --x-title "Heartbeat 05 reflection" \
        --x-url "https://x.com/_goodKn1ght/status/2020373634934534443" \
        --x-summary "No updates without receipts." \
        --x-time "2026-02-08T05:46:12Z"

Only the fields you pass are updated; omitted sections retain their prior values.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS_PATH = ROOT / "data" / "status.json"
RECEIPTS_PATH = ROOT / "data" / "receipts.json"


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--heartbeat", type=int)
    parser.add_argument("--tweets", type=int)
    parser.add_argument("--tweet-target", type=int, dest="tweet_target")
    parser.add_argument("--molt-posts", type=int, dest="molt_posts")
    parser.add_argument("--timestamp", help="ISO8601 timestamp for status.updated_at (defaults to now)")

    # Moltbook receipt
    parser.add_argument("--molt-title")
    parser.add_argument("--molt-url")
    parser.add_argument("--molt-summary")
    parser.add_argument("--molt-time")

    # X receipt
    parser.add_argument("--x-title")
    parser.add_argument("--x-url")
    parser.add_argument("--x-summary")
    parser.add_argument("--x-time")

    args = parser.parse_args()

    status = load_json(STATUS_PATH)
    receipts = load_json(RECEIPTS_PATH)

    if args.heartbeat is not None:
        status["heartbeat"] = args.heartbeat

    tweet_block = status.setdefault("tweetBurst", {"sent": 0, "target": 48})
    if args.tweets is not None:
        tweet_block["sent"] = args.tweets
    if args.tweet_target is not None:
        tweet_block["target"] = args.tweet_target

    if args.molt_posts is not None:
        status["moltPosts"] = args.molt_posts

    status["updated_at"] = args.timestamp or datetime.now(timezone.utc).isoformat()

    # Moltbook receipt update
    molt = receipts.setdefault("moltbook", {})
    if args.molt_title:
        molt["title"] = args.molt_title
    if args.molt_url:
        molt["url"] = args.molt_url
    if args.molt_summary:
        molt["summary"] = args.molt_summary
    if args.molt_time:
        molt["timestamp"] = args.molt_time

    # X receipt update
    x = receipts.setdefault("x", {})
    if args.x_title:
        x["title"] = args.x_title
    if args.x_url:
        x["url"] = args.x_url
    if args.x_summary:
        x["summary"] = args.x_summary
    if args.x_time:
        x["timestamp"] = args.x_time

    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(status, indent=2) + "\n")
    RECEIPTS_PATH.write_text(json.dumps(receipts, indent=2) + "\n")

    print("Status + receipts updated.")


if __name__ == "__main__":
    main()
