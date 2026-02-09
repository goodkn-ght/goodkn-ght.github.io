#!/usr/bin/env python3
"""Pull real cost data from OpenClaw session logs and update data/cost.json."""

import json
import glob
import pathlib
from datetime import datetime, timezone

SESSIONS_DIR = pathlib.Path.home() / ".openclaw/agents/main/sessions"
COST_PATH = pathlib.Path(__file__).resolve().parents[1] / "data" / "cost.json"

BUDGET_CAP = 100.00  # Feb 2026 transition month
OPENAI_FIXED = 25.00  # GPT-5.1-codex spend (closed)


def sum_session_costs():
    total = 0
    turns = 0
    by_model = {}

    for f in sorted(glob.glob(str(SESSIONS_DIR / "*.jsonl"))):
        for line in open(f):
            try:
                d = json.loads(line)
                msg = d.get("message", {})
                if not isinstance(msg, dict):
                    continue
                usage = msg.get("usage")
                if usage and isinstance(usage, dict):
                    cost = usage.get("cost", {})
                    if isinstance(cost, dict) and "total" in cost:
                        t = cost["total"]
                        total += t
                        turns += 1
                        model = msg.get("model", "unknown")
                        by_model[model] = by_model.get(model, 0) + t
            except:
                pass

    return total, turns, by_model


def main():
    anthropic_total, turns, by_model = sum_session_costs()
    grand_total = round(OPENAI_FIXED + anthropic_total, 2)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    cost_data = {
        "updated_at": now,
        "budget_cap_usd": BUDGET_CAP,
        "budget_note": "Transition month (OpenAI→Anthropic). Normal cap: $50/mo starting March.",
        "spent_usd": grand_total,
        "remaining_usd": round(BUDGET_CAP - grand_total, 2),
        "turns_tracked": turns,
        "breakdown": {
            "openai_gpt51": OPENAI_FIXED,
            "anthropic_opus": round(anthropic_total, 2),
        },
        "by_model": {k: round(v, 2) for k, v in sorted(by_model.items(), key=lambda x: -x[1])},
    }

    COST_PATH.write_text(json.dumps(cost_data, indent=2))
    print(f"Anthropic: ${anthropic_total:.2f} ({turns} turns) | Total: ${grand_total:.2f} / ${BUDGET_CAP}")


if __name__ == "__main__":
    main()
