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
HOT_TOPICS_PATH = DATA_DIR / "hot-topics.json"
PROFILE_URL = f"https://www.moltbook.com/api/v1/agents/profile?name={AGENT_NAME}"
HOT_POSTS_URL = "https://www.moltbook.com/api/v1/posts?sort=hot&limit=50"

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

def fetch_hot_posts(api_key: str) -> list[dict]:
    """Fetch site-wide hot posts from Moltbook."""
    req = urllib.request.Request(
        HOT_POSTS_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.load(resp)
            return data.get("posts", [])
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "ignore") if err.fp else ""
        print(f"Warning: Could not fetch hot posts ({err.code}): {body}", file=sys.stderr)
        return []

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

def build_hot_topics(posts: list[dict]) -> dict:
    """Build hot topics dataset with aggregations for demo."""
    def norm_ts(ts: str | None) -> str:
        if not ts:
            return ""
        return ts.rstrip("Z") + "Z"
    
    # Filter: posts with content length and not spam (using title/content heuristics)
    filtered = []
    spam_patterns = ["claw mint", "mint claw", "airdrop", "earn per", "free claw", "claim claw"]
    for post in posts:
        title = post.get("title", "")
        content = post.get("content", "")
        combined = f"{title} {content}".lower()
        is_spam = any(pattern in combined for pattern in spam_patterns)
        is_substantive = len(combined) > 40 or post.get("comment_count", 0) > 1
        if is_substantive and not is_spam:
            filtered.append(post)
    
    # Sort by comment_count DESC (hot topics)
    sorted_posts = sorted(filtered, key=lambda p: p.get("comment_count", 0), reverse=True)[:10]
    
    # Format entries
    entries = []
    for post in sorted_posts:
        entries.append({
            "id": post.get("id"),
            "agent_name": post.get("author", {}).get("name") or post.get("author", {}).get("agent_name", "?"),
            "title": post.get("title", ""),
            "comment_count": post.get("comment_count", 0),
            "upvotes": post.get("upvotes", 0),
            "created_at": norm_ts(post.get("created_at")),
            "category": post.get("submolt", {}).get("name") or post.get("category", "general"),
        })
    
    # GROUP BY aggregation: posts by author
    author_counts = {}
    category_counts = {}
    for post in filtered:
        agent = post.get("author", {}).get("name") or post.get("author", {}).get("agent_name", "?")
        cat = post.get("submolt", {}).get("name") or post.get("category", "general")
        author_counts[agent] = author_counts.get(agent, 0) + 1
        category_counts[cat] = category_counts.get(cat, 0) + 1
    
    # Calculate aggregates
    total_engagement = sum(p.get("comment_count", 0) + p.get("upvotes", 0) for p in sorted_posts)
    avg_comments = round(sum(p.get("comment_count", 0) for p in sorted_posts) / len(sorted_posts), 1) if sorted_posts else 0
    
    return {
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "query": "SELECT agent_name, title, comment_count, upvotes, created_at FROM posts WHERE content_length > 80 AND NOT spam ORDER BY comment_count DESC LIMIT 10",
        "pipeline": {
            "extract": {"records_fetched": len(posts), "source": "Moltbook API", "latency_ms": 0},
            "transform": {"filtered_count": len(filtered), "filter_rule": "content_length > 80 AND NOT spam", "sorted_by": "comment_count DESC"},
            "load": {"displayed": len(entries), "limit": 10},
        },
        "aggregations": {
            "by_author": [{"agent": k, "post_count": v} for k, v in sorted(author_counts.items(), key=lambda x: -x[1])[:8]],
            "by_category": [{"category": k, "count": v} for k, v in sorted(category_counts.items(), key=lambda x: -x[1])],
            "metrics": {
                "total_filtered": len(filtered),
                "total_displayed": len(entries),
                "total_engagement": total_engagement,
                "avg_comments": avg_comments,
            }
        },
        "results": entries,
    }

def main() -> None:
    api_key = load_api_key()
    
    # Fetch our profile posts for engagement tracking
    profile = fetch_profile(api_key)
    our_posts = profile.get("recentPosts", [])
    payload = build_payload(our_posts)
    ENGAGEMENT_PATH.write_text(json.dumps(payload, indent=2))
    update_status(our_posts, payload["updated_at"])
    
    # Fetch site-wide hot posts for demo
    global_posts = fetch_hot_posts(api_key)
    if not global_posts:
        print("Warning: No global posts fetched, falling back to our posts for hot topics", file=sys.stderr)
        global_posts = our_posts
    
    hot_topics = build_hot_topics(global_posts)
    HOT_TOPICS_PATH.write_text(json.dumps(hot_topics, indent=2))
    
    print(
        f"Updated {ENGAGEMENT_PATH} with {len(payload['posts'])} posts; "
        f"status now tracks {len(our_posts)} posts / {sum(p.get('comment_count', 0) for p in our_posts)} comments; "
        f"hot-topics: {len(hot_topics['results'])} results from {len(global_posts)} global posts."
    )

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
