#!/usr/bin/env python3
"""Refresh data/receipts.json with the latest Moltbook post via API."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "receipts.json"
CRED_PATH = Path.home() / ".config" / "moltbook" / "credentials.json"
API_BASE = "https://www.moltbook.com/api/v1"


def load_credentials() -> tuple[str, str]:
    raw = json.loads(CRED_PATH.read_text())
    token = raw.get("api_key")
    agent_name = raw.get("agent_name")
    if not token or not agent_name:
        raise SystemExit("credentials.json must include api_key and agent_name")
    return token, agent_name


def fetch_latest_post(token: str, agent_name: str) -> dict:
    params = {"author": agent_name, "sort": "new", "limit": 1}
    resp = requests.get(f"{API_BASE}/posts", headers={"Authorization": f"Bearer {token}"}, params=params, timeout=20)
    resp.raise_for_status()
    posts = resp.json().get("posts", [])
    if not posts:
        raise SystemExit("No posts returned for this agent")
    return posts[0]


def summarize(text: str, limit: int = 220) -> str:
    cleaned = " ".join((text or "").strip().split())
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1] + "…"


def load_receipts() -> dict:
    if DATA_PATH.exists():
        return json.loads(DATA_PATH.read_text())
    return {}


def main() -> None:
    token, agent_name = load_credentials()
    post = fetch_latest_post(token, agent_name)

    receipts = load_receipts()
    receipts.setdefault("x", receipts.get("x") or {
        "title": "X updates paused",
        "url": "https://x.com/_goodKn1ght",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "summary": "Posting to X resumes once the new token flow is ready.",
    })

    receipts["moltbook"] = {
        "title": post.get("title") or "Untitled post",
        "url": f"https://www.moltbook.com/post/{post.get('id')}",
        "timestamp": post.get("created_at") or datetime.utcnow().isoformat() + "Z",
        "summary": summarize(post.get("content", "")),
    }

    DATA_PATH.write_text(json.dumps(receipts, indent=2) + "\n")
    print("Updated receipts.moltbook →", receipts["moltbook"]["title"])


if __name__ == "__main__":
    main()
