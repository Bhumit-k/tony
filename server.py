"""
Web server exposing Tony AI over HTTP — powers both the local web UI and
the WhatsApp bridge.

Run with:
    uvicorn server:app --reload --port 8420

Endpoints:
    GET  /                        -> serves the web UI (frontend/index.html)
    POST /tony/quick              -> fast, single-agent chat (Tony alone, no
                                      sub-teams) — the default for normal
                                      conversation (dashboard chat/voice, WhatsApp)
    POST /run                     -> run the FULL multi-team pipeline, return
                                      the whole JSON result (deep-dive only)
    POST /run/stream              -> Server-Sent Events stream of the full
                                      pipeline's live progress (deep-dive only)
    POST /whatsapp/message        -> full pipeline, trimmed for chat display
                                      (used by "/tony full ..." in WhatsApp)
    GET  /skills                  -> every skill a companion could be assigned
    GET  /companions/skills       -> current skill assignments, per companion
    POST /companions/skills       -> change one companion's assigned skills
    GET  /knowledge               -> list saved knowledge base entries
    POST /knowledge               -> add a knowledge base entry
    DELETE /knowledge/{entry_id}  -> remove a knowledge base entry
    POST /device/execute          -> run a device action the user just confirmed
                                      (never called automatically by an agent)
    GET  /integrations/gmail/status    -> is Gmail configured/connected
    GET  /integrations/gmail/connect   -> get the Google OAuth consent URL
    GET  /integrations/gmail/callback  -> OAuth redirect target (Google calls this)
    POST /integrations/gmail/disconnect -> forget the stored Gmail token
    GET  /health                  -> health check
"""

from __future__ import annotations

import json
import queue
import threading
from typing import Optional

from dotenv import load_dotenv
load_dotenv()  # picks up .env in this folder automatically — no manual export needed

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import companion_config
import gmail_integration
import skills as skill_registry
from orchestrator import TonyAI

app = FastAPI(title="Tony AI Orchestrator", version="1.0.0")

# Local-only tool: wide-open CORS so the UI (and a local WhatsApp bridge
# script) can call it from any localhost port without friction.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    task: str
    # Editable assistant identity (defaults to "Tony" if omitted/blank).
    assistant_name: Optional[str] = None


class QuickRequest(BaseModel):
    task: str
    # Rolling conversation history: [{"role": "user"|"assistant", "content": "..."}]
    history: Optional[list[dict]] = None
    assistant_name: Optional[str] = None


@app.post("/tony/quick")
def tony_quick(req: QuickRequest):
    """
    Fast path: the assistant answers directly, by itself — no sub-teams
    spun up. This is what normal back-and-forth conversation should hit
    (dashboard chat/voice, WhatsApp default). Only the explicit deep-dive
    routes below run the full 11-agent pipeline. If the model proposed a
    device action, `metadata.pending_action` is set and nothing has run
    yet — the frontend shows a confirm/cancel prompt and calls
    /device/execute only if the user says yes.
    """
    tony = TonyAI(verbose=False)
    result = tony.run_quick(req.task, history=req.history, name=req.assistant_name)
    return {"reply": result.output, "error": result.error, "metadata": result.metadata}


@app.post("/run")
def run_pipeline(req: RunRequest):
    tony = TonyAI(verbose=False)
    result = tony.run(req.task, name=req.assistant_name)
    return result.to_dict()


@app.post("/run/stream")
def run_pipeline_stream(req: RunRequest):
    """
    Server-Sent Events endpoint. Streams one JSON event per line as each
    team finishes, then a final `final` event with the CEO's synthesized
    response. This is the FULL pipeline — every specialist team runs.
    Only call this for an explicit deep-dive request, not routine chat.
    """
    event_queue: "queue.Queue" = queue.Queue()
    SENTINEL = object()

    def worker():
        tony = TonyAI(verbose=False)
        try:
            tony.run(req.task, on_event=lambda ev: event_queue.put(ev), name=req.assistant_name)
        except Exception as exc:  # noqa: BLE001
            event_queue.put({"type": "error", "error": str(exc)})
        finally:
            event_queue.put(SENTINEL)

    threading.Thread(target=worker, daemon=True).start()

    def event_stream():
        yield "event: open\ndata: {}\n\n"
        while True:
            item = event_queue.get()
            if item is SENTINEL:
                break
            yield f"data: {json.dumps(item)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/whatsapp/message")
def whatsapp_message(req: RunRequest):
    """
    Full-pipeline endpoint for the WhatsApp bridge's "/tony full ..."
    command: runs every specialist team and returns just the final
    synthesized response as plain text, formatted for a chat bubble
    rather than a JSON blob. Default WhatsApp messages should hit
    /tony/quick instead — see whatsapp-bridge/index.js.
    """
    tony = TonyAI(verbose=False)
    result = tony.run(req.task, name=req.assistant_name)
    return {"reply": result.final_response}


# ============================================================
# SKILLS — what each companion can call, and who currently has what
# ============================================================

class SkillAssignmentRequest(BaseModel):
    codename: str
    skill_ids: list[str]


@app.get("/skills")
def list_skills():
    """Every skill that exists in the system, assignable to any companion."""
    return {"skills": skill_registry.all_skills_described()}


@app.get("/companions/skills")
def get_companion_skills():
    """codename -> list of assigned skill ids, for every companion (defaults included)."""
    return companion_config.get_all_skill_assignments()


@app.post("/companions/skills")
def set_companion_skills(req: SkillAssignmentRequest):
    valid_ids = set(skill_registry.all_skill_ids())
    filtered = [s for s in req.skill_ids if s in valid_ids]
    companion_config.set_skills_for(req.codename, filtered)
    return {"codename": req.codename, "skill_ids": filtered}


# ============================================================
# KNOWLEDGE BASE — shared context injected into every companion's prompt
# ============================================================

class KnowledgeRequest(BaseModel):
    text: str


@app.get("/knowledge")
def get_knowledge():
    return {"entries": companion_config.list_knowledge()}


@app.post("/knowledge")
def post_knowledge(req: KnowledgeRequest):
    if not req.text.strip():
        raise HTTPException(400, "text can't be empty")
    return companion_config.add_knowledge(req.text)


@app.delete("/knowledge/{entry_id}")
def delete_knowledge_entry(entry_id: str):
    if not companion_config.delete_knowledge(entry_id):
        raise HTTPException(404, "no knowledge entry with that id")
    return {"deleted": entry_id}


# ============================================================
# DEVICE ACTIONS — only ever called after the user explicitly confirms.
# An agent proposing an action (via /tony/quick's pending_action) never
# reaches this endpoint on its own; the frontend calls it only in
# response to the user tapping "Confirm".
# ============================================================

class DeviceActionRequest(BaseModel):
    name: str
    arguments: dict


@app.post("/device/execute")
def device_execute(req: DeviceActionRequest):
    dispatch = skill_registry.dispatch_for([req.name])
    handler = dispatch.get(req.name)
    if not handler:
        raise HTTPException(404, f"no device action named '{req.name}'")
    return handler(req.arguments)


@app.get("/health")
def health():
    return {"status": "ok"}


# ============================================================
# INTEGRATIONS — Gmail (OAuth2 + Gmail REST API, see gmail_integration.py).
# Requires the user's own Google Cloud OAuth credentials in .env — see the
# setup instructions at the top of gmail_integration.py. Sending itself
# still goes through the normal confirm-before-run flow via /device/execute.
# ============================================================

@app.get("/integrations/gmail/status")
def gmail_status():
    return gmail_integration.status()


@app.get("/integrations/gmail/connect")
def gmail_connect():
    try:
        return {"auth_url": gmail_integration.auth_url()}
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))


@app.get("/integrations/gmail/callback")
def gmail_callback(code: str = ""):
    """Google redirects here after the user approves access. Not a JSON
    endpoint — it's a browser landing page, so it returns simple HTML."""
    if not code:
        return HTMLResponse("<h3>Missing authorization code.</h3><p>You can close this tab.</p>", status_code=400)
    try:
        gmail_integration.handle_callback(code)
        return HTMLResponse(
            "<h3>Gmail connected.</h3><p>You can close this tab and go back to the dashboard.</p>"
            "<script>setTimeout(() => window.close(), 1500)</script>"
        )
    except Exception as exc:  # noqa: BLE001
        return HTMLResponse(f"<h3>Couldn't connect Gmail.</h3><p>{exc}</p>", status_code=400)


@app.post("/integrations/gmail/disconnect")
def gmail_disconnect():
    gmail_integration.disconnect()
    return {"connected": False}


# Serve the web UI at http://localhost:8420/
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
