#!/usr/bin/env python3
"""Append current Anthropic token usage snapshot to data/tokens.json.

Usage: python3 update_tokens.py [input_tokens] [cached_tokens] [output_tokens]

If no args, reads from environment: ANTHROPIC_INPUT, ANTHROPIC_CACHED, ANTHROPIC_OUTPUT.
Also updates cost.json with the latest Anthropic spend.
"""

import json
import pathlib
import sys
from datetime import datetime, timezone

DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / "data"
TOKENS_PATH = DATA_DIR / "tokens.json"
COST_PATH = DATA_DIR / "cost.json"

# Anthropic Claude Opus pricing (per token)
PRICE_INPUT = 15.00 / 1_000_000        # $15/M input
PRICE_CACHE_WRITE = 18.75 / 1_000_000  # $18.75/M cache write
PRICE_CACHE_READ = 1.50 / 1_000_000    # $1.50/M cache read
PRICE_OUTPUT = 75.00 / 1_000_000       # $75/M output


def main():
    import os

    if len(sys.argv) >= 4:
        input_tokens = int(sys.argv[1])
        cached_tokens = int(sys.argv[2])
        output_tokens = int(sys.argv[3])
    else:
        input_tokens = int(os.environ.get("ANTHROPIC_INPUT", 0))
        cached_tokens = int(os.environ.get("ANTHROPIC_CACHED", 0))
        output_tokens = int(os.environ.get("ANTHROPIC_OUTPUT", 0))

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Load existing tokens data
    try:
        tokens_data = json.loads(TOKENS_PATH.read_text())
    except FileNotFoundError:
        tokens_data = {"entries": []}

    entries = tokens_data.get("entries", [])

    # Calculate deltas from last entry
    prev_in = entries[-1].get("tokensIn", 0) if entries else 0
    prev_out = entries[-1].get("tokensOut", 0) if entries else 0

    entry = {
        "timestamp": now,
        "tokensIn": input_tokens,
        "tokensCached": cached_tokens,
        "tokensOut": output_tokens,
        "deltaIn": input_tokens - prev_in,
        "deltaOut": output_tokens - prev_out,
    }

    entries.append(entry)
    # Keep last 50 entries
    tokens_data["entries"] = entries[-50:]
    TOKENS_PATH.write_text(json.dumps(tokens_data, indent=2))

    # Update cost.json with computed Anthropic spend
    # Estimate: uncached input * input price + cached * cache_read price + output * output price
    # Cache write cost is harder to track exactly; approximate from the difference
    uncached = max(0, input_tokens - cached_tokens)
    anthropic_cost = (
        uncached * PRICE_INPUT
        + cached_tokens * PRICE_CACHE_READ
        + output_tokens * PRICE_OUTPUT
    )

    try:
        cost_data = json.loads(COST_PATH.read_text())
    except FileNotFoundError:
        cost_data = {}

    openai_spend = cost_data.get("breakdown", {}).get("openai_gpt51", 25.00)
    cost_data["breakdown"] = cost_data.get("breakdown", {})
    cost_data["breakdown"]["anthropic_opus"] = round(anthropic_cost, 2)
    cost_data["breakdown"]["openai_gpt51"] = openai_spend
    total = round(openai_spend + anthropic_cost, 2)
    cap = cost_data.get("budget_cap_usd", 100.00)
    cost_data["spent_usd"] = total
    cost_data["remaining_usd"] = round(cap - total, 2)
    cost_data["updated_at"] = now
    COST_PATH.write_text(json.dumps(cost_data, indent=2))

    print(f"Tokens: {input_tokens} in ({cached_tokens} cached) / {output_tokens} out")
    print(f"Anthropic est: ${anthropic_cost:.2f} | Total: ${total:.2f} / ${cap:.2f}")


if __name__ == "__main__":
    main()
