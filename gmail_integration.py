"""
Real Gmail integration — OAuth2 + the Gmail REST API directly, using only
`requests` (already a dependency) rather than pulling in the full
google-api-python-client / google-auth-oauthlib stack.

THIS REQUIRES YOUR OWN GOOGLE CLOUD CREDENTIALS. I can't provision these
for you — Google requires each application to register its own OAuth
client. One-time setup:

1. https://console.cloud.google.com/apis/credentials -> Create Credentials
   -> OAuth client ID -> Application type: "Web application"
2. Add this exact redirect URI: http://localhost:8420/integrations/gmail/callback
3. https://console.cloud.google.com/apis/library/gmail.googleapis.com -> Enable
4. Put the resulting Client ID and Client Secret in .env as
   GOOGLE_CLIENT_ID=... and GOOGLE_CLIENT_SECRET=...
5. Restart the server, then use the Integrations panel in settings to connect.

Until that's done, `status()` reports `configured: false` and every other
function in here fails loudly rather than pretending to work.

Sending itself still goes through the same confirm-before-run flow as
every other device action (see skills.requires_confirmation) — connecting
Gmail does not mean emails start sending themselves.
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.parse
from email.mime.text import MIMEText

import requests

_TOKEN_FILE = os.path.join(os.path.dirname(__file__), "data", "gmail_token.json")
_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
_SCOPE = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email"
_REDIRECT_URI = os.environ.get("GMAIL_REDIRECT_URI", "http://localhost:8420/integrations/gmail/callback")


def _client_id() -> str | None:
    return os.environ.get("GOOGLE_CLIENT_ID")


def _client_secret() -> str | None:
    return os.environ.get("GOOGLE_CLIENT_SECRET")


def is_configured() -> bool:
    return bool(_client_id() and _client_secret())


def _read_token() -> dict | None:
    if not os.path.exists(_TOKEN_FILE):
        return None
    try:
        with open(_TOKEN_FILE) as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return None


def _write_token(data: dict) -> None:
    os.makedirs(os.path.dirname(_TOKEN_FILE), exist_ok=True)
    with open(_TOKEN_FILE, "w") as f:
        json.dump(data, f)


def is_connected() -> bool:
    return _read_token() is not None


def disconnect() -> None:
    if os.path.exists(_TOKEN_FILE):
        os.remove(_TOKEN_FILE)


def auth_url() -> str:
    if not is_configured():
        raise RuntimeError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET aren't set in .env — see the setup steps at the top of this file.")
    params = {
        "client_id": _client_id(),
        "redirect_uri": _REDIRECT_URI,
        "response_type": "code",
        "scope": _SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{_AUTH_URL}?{urllib.parse.urlencode(params)}"


def handle_callback(code: str) -> dict:
    resp = requests.post(_TOKEN_URL, data={
        "code": code,
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "redirect_uri": _REDIRECT_URI,
        "grant_type": "authorization_code",
    }, timeout=10)
    resp.raise_for_status()
    token = resp.json()
    token["obtained_at"] = time.time()
    _write_token(token)
    return token


def _access_token() -> str:
    token = _read_token()
    if not token:
        raise RuntimeError("Gmail isn't connected — connect it from Integrations in settings first.")
    age = time.time() - token.get("obtained_at", 0)
    if age > token.get("expires_in", 3500) - 60:
        resp = requests.post(_TOKEN_URL, data={
            "refresh_token": token["refresh_token"],
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "grant_type": "refresh_token",
        }, timeout=10)
        resp.raise_for_status()
        token.update(resp.json())
        token["obtained_at"] = time.time()
        _write_token(token)
    return token["access_token"]


def status() -> dict:
    if not is_configured():
        return {"configured": False, "connected": False}
    if not is_connected():
        return {"configured": True, "connected": False}
    try:
        access = _access_token()
        r = requests.get(_PROFILE_URL, headers={"Authorization": f"Bearer {access}"}, timeout=10)
        r.raise_for_status()
        return {"configured": True, "connected": True, "email": r.json().get("emailAddress")}
    except Exception as exc:  # noqa: BLE001
        return {"configured": True, "connected": False, "error": str(exc)}


def send_gmail(to: str, subject: str, body: str) -> dict:
    try:
        access = _access_token()
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}
    msg = MIMEText(body)
    msg["to"] = to
    msg["subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    try:
        r = requests.post(
            _SEND_URL,
            headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"},
            json={"raw": raw}, timeout=15,
        )
        if r.status_code >= 400:
            return {"error": r.text}
        return {"ok": True, "id": r.json().get("id")}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


GMAIL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "send_gmail",
            "description": (
                "Send a real email via the user's connected Gmail account. Only works if "
                "Gmail is connected in Integrations settings. Always requires user "
                "confirmation before sending — never claim an email was sent unless this "
                "was actually confirmed and run."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"},
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
]
GMAIL_DISPATCH = {"send_gmail": lambda args: send_gmail(args["to"], args["subject"], args["body"])}
GMAIL_REQUIRES_CONFIRMATION = {"send_gmail"}
