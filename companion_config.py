"""
Lightweight local persistence for two things a user configures at runtime:

- which skills each companion (by codename) currently has enabled
- the shared knowledge base injected into every companion's context

Stored as plain JSON under data/, next to this file. No database — this is
a single-user local tool, so a JSON file is the right amount of
infrastructure. Nothing here trains a model; it's plain prompt injection
you can inspect, edit, or delete by touching the files directly, or via
the dashboard's Knowledge Base panel.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
_SKILLS_FILE = os.path.join(_DATA_DIR, "companion_skills.json")
_KNOWLEDGE_FILE = os.path.join(_DATA_DIR, "knowledge.json")
_lock = threading.Lock()

# Sensible starting point — the user can change any of this from the
# dashboard's Skills panel; these are just what a fresh install ships with.
DEFAULT_SKILLS: dict[str, list[str]] = {
    "Tony": ["get_weather", "wikipedia_summary", "currency_convert", "random_fact",
             "play_music", "open_app", "open_whatsapp_chat", "draft_email", "create_calendar_event",
             "open_restaurant_booking", "send_gmail"],
    "Sherlock": ["wikipedia_summary", "random_fact"],
    "Ledger": ["currency_convert"],
    "Venture": ["currency_convert"],
    "Flow": ["get_weather"],
}


def _ensure_dir():
    os.makedirs(_DATA_DIR, exist_ok=True)


def _read(path: str, default):
    _ensure_dir()
    if not os.path.exists(path):
        return default
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return default


def _write(path: str, data) -> None:
    _ensure_dir()
    with _lock:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)


def get_skills_for(codename: str) -> list[str]:
    config = _read(_SKILLS_FILE, {})
    if codename in config:
        return config[codename]
    return DEFAULT_SKILLS.get(codename, [])


def get_all_skill_assignments() -> dict[str, list[str]]:
    """Defaults merged with any saved overrides, so the UI always has a full picture."""
    merged = dict(DEFAULT_SKILLS)
    merged.update(_read(_SKILLS_FILE, {}))
    return merged


def set_skills_for(codename: str, skill_ids: list[str]) -> None:
    config = _read(_SKILLS_FILE, dict(DEFAULT_SKILLS))
    config[codename] = skill_ids
    _write(_SKILLS_FILE, config)


def list_knowledge() -> list[dict]:
    return _read(_KNOWLEDGE_FILE, [])


def add_knowledge(text: str) -> dict:
    text = (text or "").strip()
    entries = list_knowledge()
    entry = {"id": uuid.uuid4().hex[:8], "text": text, "created_at": time.time()}
    entries.append(entry)
    _write(_KNOWLEDGE_FILE, entries)
    return entry


def delete_knowledge(entry_id: str) -> bool:
    entries = list_knowledge()
    remaining = [e for e in entries if e["id"] != entry_id]
    changed = len(remaining) != len(entries)
    if changed:
        _write(_KNOWLEDGE_FILE, remaining)
    return changed


def knowledge_block(max_chars: int = 4000) -> str:
    """Rendered as plain text for injection into a system prompt. Empty string if nothing saved."""
    entries = list_knowledge()
    if not entries:
        return ""
    block = "\n".join(f"- {e['text']}" for e in entries)
    if len(block) > max_chars:
        block = block[:max_chars] + "\n… (truncated — knowledge base is large, trim it in settings)"
    return block
