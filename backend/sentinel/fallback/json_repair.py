# backend/sentinel/fallback/json_repair.py
"""
3-layer JSON repair for LLM responses lacking native JSON mode (e.g. Groq).
Used by Triage Agent; reusable by any future agent parsing LLM JSON output.
"""

import json
import re


def repair_json(raw_text: str) -> dict:
    # Layer 1: direct parse
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        pass

    # Layer 2: unbalanced braces (LLM output truncated before the closing
    # brace, e.g. hit max_tokens mid-response) — append what's missing and
    # retry, rather than discarding the LLM's actual diagnosis for the
    # generic rule-based heuristic.
    open_count, close_count = raw_text.count("{"), raw_text.count("}")
    if open_count > close_count:
        try:
            return json.loads(raw_text + "}" * (open_count - close_count))
        except json.JSONDecodeError:
            pass

    # Layer 3: extract from markdown/code blocks
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Layer 4: find first {...} blob anywhere in the text
    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not repair JSON from: {raw_text[:200]}")