"""
Unified skill registry.

A "skill" is one callable tool a companion can be given — either a
read-only public-API lookup (tools.py) or a device action that changes
something on the user's machine and requires explicit confirmation before
running (device_actions.py). This module doesn't define new skills; it
just gives both families one consistent id/schema/dispatch surface so a
companion can be assigned any combination of them (see companion_config.py
for *which* companion has *which* skills, and teams/base_agent.py for how
a companion actually calls one).

A skill's id is simply its OpenAI function name — get_weather,
wikipedia_summary, play_music, etc. — there's no separate id layer to keep
in sync.
"""

from __future__ import annotations

from tools import TOOL_SCHEMAS, TOOL_DISPATCH
from device_actions import DEVICE_ACTION_SCHEMAS, DEVICE_ACTION_DISPATCH, REQUIRES_CONFIRMATION
from gmail_integration import GMAIL_SCHEMAS, GMAIL_DISPATCH, GMAIL_REQUIRES_CONFIRMATION

SKILL_META = {
    "get_weather": {"label": "Weather", "category": "knowledge"},
    "wikipedia_summary": {"label": "Wikipedia lookup", "category": "knowledge"},
    "currency_convert": {"label": "Currency conversion", "category": "knowledge"},
    "random_fact": {"label": "Random fact", "category": "knowledge"},
    "play_music": {"label": "Play Apple Music", "category": "device"},
    "open_app": {"label": "Open an app", "category": "device"},
    "open_whatsapp_chat": {"label": "Draft WhatsApp message", "category": "device"},
    "draft_email": {"label": "Draft email (Mail.app)", "category": "device"},
    "create_calendar_event": {"label": "Create calendar event", "category": "device"},
    "open_restaurant_booking": {"label": "Search restaurant booking", "category": "device"},
    "send_gmail": {"label": "Send Gmail", "category": "integration"},
}

_ALL_SCHEMAS = {s["function"]["name"]: s for s in (TOOL_SCHEMAS + DEVICE_ACTION_SCHEMAS + GMAIL_SCHEMAS)}
_ALL_DISPATCH = {**TOOL_DISPATCH, **DEVICE_ACTION_DISPATCH, **GMAIL_DISPATCH}
_ALL_REQUIRES_CONFIRMATION = REQUIRES_CONFIRMATION | GMAIL_REQUIRES_CONFIRMATION


def all_skill_ids() -> list[str]:
    return list(_ALL_SCHEMAS.keys())


def schemas_for(skill_ids: list[str]) -> list[dict]:
    """OpenAI tool schemas for a companion's assigned skill ids, unknown ids dropped."""
    return [_ALL_SCHEMAS[s] for s in skill_ids if s in _ALL_SCHEMAS]


def dispatch_for(skill_ids: list[str]) -> dict:
    """name -> callable map, scoped to only the skills this companion actually has."""
    return {s: _ALL_DISPATCH[s] for s in skill_ids if s in _ALL_DISPATCH}


def requires_confirmation(skill_id: str) -> bool:
    return skill_id in _ALL_REQUIRES_CONFIRMATION


def describe(skill_id: str) -> dict:
    meta = SKILL_META.get(skill_id, {})
    schema = _ALL_SCHEMAS.get(skill_id, {}).get("function", {})
    return {
        "id": skill_id,
        "label": meta.get("label", skill_id),
        "category": meta.get("category", "other"),
        "description": schema.get("description", ""),
        "requires_confirmation": skill_id in _ALL_REQUIRES_CONFIRMATION,
    }


def all_skills_described() -> list[dict]:
    return [describe(s) for s in all_skill_ids()]


def human_label(skill_id: str, arguments: dict) -> str:
    """A short, readable description of a pending action for a confirmation prompt."""
    if skill_id == "play_music":
        return f"play '{arguments.get('query', '?')}' on Apple Music"
    if skill_id == "open_app":
        return f"open {arguments.get('app_name', '?')}"
    if skill_id == "open_whatsapp_chat":
        msg = arguments.get("message")
        return f"open a WhatsApp chat with {arguments.get('phone_or_contact', '?')}" + (f' pre-filled with "{msg}"' if msg else "")
    if skill_id == "draft_email":
        return f"draft an email to {arguments.get('to', '?')} — \"{arguments.get('subject', '')}\""
    if skill_id == "create_calendar_event":
        return f"create a calendar event \"{arguments.get('title', '?')}\" from {arguments.get('start_iso', '?')} to {arguments.get('end_iso', '?')}"
    if skill_id == "open_restaurant_booking":
        party = arguments.get("party_size", 2)
        return f"open an OpenTable search for {arguments.get('query', '?')} for {party} — you'll finish booking there"
    if skill_id == "send_gmail":
        return f"send a Gmail to {arguments.get('to', '?')} — \"{arguments.get('subject', '')}\""
    return f"run {skill_id}"
