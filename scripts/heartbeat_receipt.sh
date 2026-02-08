#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HEARTBEAT=""
TWEETS=""
MOLT_POSTS=""
TWEET_TARGET=48
MOLT_TITLE=""
MOLT_URL=""
MOLT_SUMMARY=""
MOLT_TIME=""
X_TITLE=""
X_URL=""
X_SUMMARY=""
X_TIME=""
TIMESTAMP=""

usage() {
  cat <<EOF
Usage: $0 --heartbeat N --tweets N --molt-posts N \\
          --molt-title TITLE --molt-url URL --molt-summary SUMMARY \\
          --x-title TITLE --x-url URL --x-summary SUMMARY [options]

Options:
  --tweet-target N       Override 24h tweet target (default 48)
  --molt-time ISO        Timestamp for Moltbook receipt (default: now)
  --x-time ISO           Timestamp for X receipt (default: now)
  --timestamp ISO        Override status updated_at (default: now)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --heartbeat) HEARTBEAT=$2; shift 2 ;;
    --tweets) TWEETS=$2; shift 2 ;;
    --molt-posts) MOLT_POSTS=$2; shift 2 ;;
    --tweet-target) TWEET_TARGET=$2; shift 2 ;;
    --molt-title) MOLT_TITLE=$2; shift 2 ;;
    --molt-url) MOLT_URL=$2; shift 2 ;;
    --molt-summary) MOLT_SUMMARY=$2; shift 2 ;;
    --molt-time) MOLT_TIME=$2; shift 2 ;;
    --x-title) X_TITLE=$2; shift 2 ;;
    --x-url) X_URL=$2; shift 2 ;;
    --x-summary) X_SUMMARY=$2; shift 2 ;;
    --x-time) X_TIME=$2; shift 2 ;;
    --timestamp) TIMESTAMP=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$HEARTBEAT" || -z "$TWEETS" || -z "$MOLT_POSTS" || -z "$MOLT_TITLE" || -z "$MOLT_URL" || -z "$MOLT_SUMMARY" || -z "$X_TITLE" || -z "$X_URL" || -z "$X_SUMMARY" ]]; then
  echo "Missing required arguments" >&2
  usage
  exit 1
fi

now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

: "${MOLT_TIME:=$(now_iso)}"
: "${X_TIME:=$(now_iso)}"
: "${TIMESTAMP:=$(now_iso)}"

python3 "$ROOT/scripts/update_status.py" \
  --heartbeat "$HEARTBEAT" \
  --tweets "$TWEETS" \
  --tweet-target "$TWEET_TARGET" \
  --molt-posts "$MOLT_POSTS" \
  --timestamp "$TIMESTAMP" \
  --molt-title "$MOLT_TITLE" \
  --molt-url "$MOLT_URL" \
  --molt-summary "$MOLT_SUMMARY" \
  --molt-time "$MOLT_TIME" \
  --x-title "$X_TITLE" \
  --x-url "$X_URL" \
  --x-summary "$X_SUMMARY" \
  --x-time "$X_TIME"
