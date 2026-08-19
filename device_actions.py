"""
Real device actions — opening apps, playing music, drafting messages,
creating calendar events — via macOS AppleScript (`osascript`).

CRITICAL SAFETY MODEL: nothing in this file is ever called directly from
the OpenAI tool-calling loop. `orchestrator.py` intercepts any call to a
tool listed in `REQUIRES_CONFIRMATION` and returns it to the *frontend* as
a proposed action instead of executing it. The frontend shows the user
what's about to happen and only calls `/device/execute` (which calls the
functions below) after they explicitly confirm. An LLM deciding to control
your computer should never be a single unsupervised step.

Platform: macOS only. AppleScript (`osascript`) is a macOS automation
layer with no equivalent on Windows/Linux, and none of this can run from
a browser — it requires the FastAPI backend to be running locally on a
Mac, not viewed through a preview or a remote server.

What's deliberately NOT here: silently sending a WhatsApp message or email
without you seeing it first. WhatsApp Desktop has no public scripting API
for sending messages, so `open_whatsapp_chat` opens a pre-filled chat via
a wa.me link — you still press Send yourself. Email drafts land in Mail.app
unsent, for the same reason.
"""

from __future__ import annotations

import platform
import subprocess
import urllib.parse

IS_MACOS = platform.system() == "Darwin"
_TIMEOUT = 15


def _run_applescript(script: str) -> dict:
    if not IS_MACOS:
        return {"error": "Device actions require macOS (AppleScript) — this backend isn't running on a Mac."}
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=_TIMEOUT,
        )
        if result.returncode != 0:
            return {"error": (result.stderr or "AppleScript command failed").strip()}
        return {"ok": True, "output": result.stdout.strip()}
    except FileNotFoundError:
        return {"error": "osascript not found — this only works on macOS."}
    except subprocess.TimeoutExpired:
        return {"error": "The command timed out."}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def _escape(s: str) -> str:
    """Escape a string for safe interpolation into an AppleScript double-quoted literal."""
    return (s or "").replace("\\", "\\\\").replace('"', '\\"')


def play_music(query: str) -> dict:
    """Search for and play a track/artist/album in Apple Music (Music.app)."""
    q = _escape(query)
    script = f'''
    tell application "Music"
        activate
        set theTracks to (every track of library playlist 1 whose name contains "{q}" or artist contains "{q}")
        if (count of theTracks) > 0 then
            play item 1 of theTracks
            return "Playing " & (name of item 1 of theTracks) & " by " & (artist of item 1 of theTracks)
        else
            return "no match"
        end if
    end tell
    '''
    result = _run_applescript(script)
    if result.get("output") == "no match":
        return {"error": f"couldn't find '{query}' in your Apple Music library"}
    return result


def open_app(app_name: str) -> dict:
    """Open/activate a named macOS application (e.g. 'WhatsApp', 'Calendar')."""
    if not IS_MACOS:
        return {"error": "Device actions require macOS — this backend isn't running on a Mac."}
    try:
        result = subprocess.run(
            ["open", "-a", app_name], capture_output=True, text=True, timeout=_TIMEOUT,
        )
        if result.returncode != 0:
            return {"error": f"couldn't open '{app_name}' — is it installed? ({result.stderr.strip()})"}
        return {"ok": True, "opened": app_name}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def open_whatsapp_chat(phone_or_contact: str, message: str = "") -> dict:
    """
    Open a WhatsApp chat with a pre-filled message via a wa.me link. This
    does NOT send anything — WhatsApp Desktop has no scripting API for
    silent sending, so the chat opens with the draft ready and the user
    presses Send themselves.
    """
    digits = "".join(ch for ch in phone_or_contact if ch.isdigit())
    if not digits:
        return {"error": "give a phone number with country code (e.g. '15551234567') to open a WhatsApp chat — a contact name can't be resolved without WhatsApp's own address book"}
    url = f"https://wa.me/{digits}"
    if message:
        url += f"?text={urllib.parse.quote(message)}"
    return open_url(url)


def open_url(url: str) -> dict:
    """Open a URL in the default browser (macOS `open`, cross-platform-safe fallback)."""
    try:
        opener = "open" if IS_MACOS else ("xdg-open" if platform.system() == "Linux" else None)
        if opener is None:
            return {"error": "opening URLs from the backend isn't supported on this OS"}
        result = subprocess.run([opener, url], capture_output=True, text=True, timeout=_TIMEOUT)
        if result.returncode != 0:
            return {"error": result.stderr.strip() or "failed to open URL"}
        return {"ok": True, "url": url}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def draft_email(to: str, subject: str, body: str) -> dict:
    """Create an unsent draft in Mail.app — never sends automatically."""
    to_e, subj_e, body_e = _escape(to), _escape(subject), _escape(body)
    script = f'''
    tell application "Mail"
        activate
        set newMsg to make new outgoing message with properties {{subject:"{subj_e}", content:"{body_e}", visible:true}}
        tell newMsg
            make new to recipient at end of to recipients with properties {{address:"{to_e}"}}
        end tell
        return "draft created"
    end tell
    '''
    return _run_applescript(script)


def create_calendar_event(title: str, start_iso: str, end_iso: str, notes: str = "") -> dict:
    """
    Create an event in Calendar.app. start_iso/end_iso should be
    AppleScript-parseable date strings, e.g. 'August 20, 2026 3:00:00 PM'
    — the calling agent is instructed to format them that way.
    """
    title_e, notes_e = _escape(title), _escape(notes)
    start_e, end_e = _escape(start_iso), _escape(end_iso)
    script = f'''
    tell application "Calendar"
        activate
        tell calendar 1
            make new event with properties {{summary:"{title_e}", start date:date "{start_e}", end date:date "{end_e}", description:"{notes_e}"}}
        end tell
        return "event created"
    end tell
    '''
    return _run_applescript(script)


def open_restaurant_booking(query: str, party_size: int = 2, date: str = "", time_str: str = "") -> dict:
    """
    Opens OpenTable's search results pre-filled with the restaurant/area,
    party size, and (if given) date/time. This does NOT complete a booking
    automatically — there is no consumer API for that. OpenTable, Resy, and
    similar platforms only offer booking APIs to registered restaurant
    partners, not to a personal script. The user picks a time and confirms
    the reservation themselves on the page that opens.
    """
    params = {"query": query, "covers": party_size}
    if date:
        params["dateTime"] = f"{date} {time_str}".strip()
    url = f"https://www.opentable.com/s?{urllib.parse.urlencode(params)}"
    return open_url(url)


# Tools the model may call in `run_with_history`'s normal tool loop but
# which the orchestrator intercepts and routes to a confirmation step
# instead of executing inline. See NAME_PLACEHOLDER / _complete in
# teams/base_agent.py and the /device/execute endpoint in server.py.
REQUIRES_CONFIRMATION = {
    "play_music", "open_app", "open_whatsapp_chat", "draft_email", "create_calendar_event",
    "open_restaurant_booking",
}

DEVICE_ACTION_DISPATCH = {
    "play_music": lambda args: play_music(args["query"]),
    "open_app": lambda args: open_app(args["app_name"]),
    "open_whatsapp_chat": lambda args: open_whatsapp_chat(args["phone_or_contact"], args.get("message", "")),
    "draft_email": lambda args: draft_email(args["to"], args["subject"], args["body"]),
    "create_calendar_event": lambda args: create_calendar_event(
        args["title"], args["start_iso"], args["end_iso"], args.get("notes", "")
    ),
    "open_restaurant_booking": lambda args: open_restaurant_booking(
        args["query"], args.get("party_size", 2), args.get("date", ""), args.get("time_str", "")
    ),
}

DEVICE_ACTION_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "play_music",
            "description": "Play a song, artist, or album in Apple Music (macOS Music.app). Requires user confirmation before running.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Song title, artist, or album to search for"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_app",
            "description": "Open or switch to a named macOS application, e.g. 'WhatsApp', 'Calendar', 'Mail'. Requires user confirmation.",
            "parameters": {
                "type": "object",
                "properties": {"app_name": {"type": "string"}},
                "required": ["app_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_whatsapp_chat",
            "description": (
                "Open a WhatsApp chat with a pre-filled message draft, ready for the user to press Send. "
                "Does NOT send automatically. Requires a phone number with country code, not just a name."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "phone_or_contact": {"type": "string", "description": "Phone number with country code, e.g. '15551234567'"},
                    "message": {"type": "string", "description": "Message text to pre-fill"},
                },
                "required": ["phone_or_contact"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_email",
            "description": "Create an unsent email draft in Mail.app for the user to review and send. Never sends automatically. Requires user confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"},
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_calendar_event",
            "description": "Create a new event in macOS Calendar.app. Requires user confirmation before running.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "start_iso": {"type": "string", "description": "e.g. 'August 20, 2026 3:00:00 PM'"},
                    "end_iso": {"type": "string", "description": "e.g. 'August 20, 2026 3:30:00 PM'"},
                    "notes": {"type": "string"},
                },
                "required": ["title", "start_iso", "end_iso"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_restaurant_booking",
            "description": (
                "Open an OpenTable search pre-filled with a restaurant/area, party size, and "
                "optionally a date/time. Does NOT complete the booking — no consumer API exists "
                "for that; the user finishes it on the page that opens. Requires confirmation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Restaurant name or area/cuisine, e.g. 'Italian in Dublin'"},
                    "party_size": {"type": "integer", "description": "Number of people, default 2"},
                    "date": {"type": "string", "description": "Optional date, e.g. '2026-08-20'"},
                    "time_str": {"type": "string", "description": "Optional time, e.g. '19:30'"},
                },
                "required": ["query"],
            },
        },
    },
]
