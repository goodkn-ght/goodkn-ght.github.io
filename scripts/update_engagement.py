#!/usr/bin/env python3
"""Pull recent Moltbook posts + engagement stats into data/engagement.json."""
from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

AGENT_NAME = os.getenv("MOLTBOOK_AGENT", "_goodKnight")
OUTPUT_PATH = pathlib.Path(__file__).resolve().parents[1] / "data" / "engagement.json"
PROFILE_URL = f"https://www.moltbook.com/api/v1/agents/profile?name={AGENT_NAME}"


def load_api_key() -> str:
    env_key = os.getenv("MOLTBOOK_API_KEY")
    if env_key:
        return env_key
    cred_path = pathlib.Path.home() / ".config" / "moltbook" / "credentials.json"
    try:
        data = json.loads(cred_path.read_text())
        return data.get("api_key")
    except FileNotFoundError:
        raise SystemExit("Missing MOLTBOOK_API_KEY env or ~/.config/moltbook/credentials.json")


def fetch_profile(api_key: str) -> dict:
    req = urllib.request.Request(
        PROFILE_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:  # nosec B310
            return json.load(resp)
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "ignore") if err.fp else ""
        raise SystemExit(f"Moltbook API error {err.code}: {body}")


def build_payload(posts: list[dict]) -> dict:
    def norm_ts(ts: str | None) -> str:
        if not ts:
            return ""
        return ts.rstrip("Z") + "Z"

    entries = []
    for post in posts:
        entries.append(
            {
                "id": post.get("id"),
                "heartbeat": post.get("heartbeat"),
                "title": post.get("title"),
                "timestamp": norm_ts(post.get("created_at")),
                "comments": post.get("comment_count", 0),
                "upvotes": post.get("upvotes", 0),
                "url": f"https://www.moltbook.com/post/{post.get('id')}" if post.get("id") else None,
            }
        )

    entries.sort(key=lambda item: item.get("timestamp") or "")
    return {
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "posts": entries,
    }


def main() -> None:
    api_key = load_api_key()
    profile = fetch_profile(api_key)
    posts = profile.get("recentPosts", [])
    payload = build_payload(posts)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f"Updated {OUTPUT_PATH} with {len(payload['posts'])} posts.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
