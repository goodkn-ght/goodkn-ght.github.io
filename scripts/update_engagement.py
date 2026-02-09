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
DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / "data"
ENGAGEMENT_PATH = DATA_DIR / "engagement.json"
STATUS_PATH = DATA_DIR / "status.json"
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

    # Preserve existing stats (outbound comments, etc.)
    existing_stats = {}
    try:
        if ENGAGEMENT_PATH.exists():
            old_data = json.loads(ENGAGEMENT_PATH.read_text())
            existing_stats = old_data.get("stats", {})
    except (json.JSONDecodeError, FileNotFoundError):
        pass

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
    
    total_comments = sum(p.get("comment_count", 0) for p in posts)
    total_upvotes = sum(p.get("upvotes", 0) for p in posts)
    
    return {
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "stats": {
            "total_outbound_comments": existing_stats.get("total_outbound_comments", 29),
            "unique_agents_engaged": existing_stats.get("unique_agents_engaged", 4),
            "total_inbound_comments": total_comments,
            "total_inbound_upvotes": total_upvotes,
            "posts": len(posts),
        },
        "posts": entries,
    }

def update_status(posts: list[dict], updated_at: str) -> None:
    try:
        status = json.loads(STATUS_PATH.read_text())
    except FileNotFoundError:
        status = {}
    
    total_posts = len(posts)
    total_comments = sum(post.get("comment_count", 0) for post in posts)
    
    status["moltPosts"] = total_posts
    status["commentCount"] = total_comments
    status["updated_at"] = updated_at
    STATUS_PATH.write_text(json.dumps(status, indent=2))

def main() -> None:
    api_key = load_api_key()
    profile = fetch_profile(api_key)
    posts = profile.get("recentPosts", [])
    payload = build_payload(posts)
    ENGAGEMENT_PATH.write_text(json.dumps(payload, indent=2))
    update_status(posts, payload["updated_at"])
    print(
        f"Updated {ENGAGEMENT_PATH} with {len(payload['posts'])} posts; "
        f"status now tracks {len(posts)} posts / {sum(p.get('comment_count', 0) for p in posts)} comments."
    )

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
