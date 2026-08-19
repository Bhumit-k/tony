# Tony AI — Multi-Team Orchestration System

A working implementation of this pipeline, complete with a CLI, a JSON/HTTP
API, a single consolidated web dashboard (chat, voice, live agent feed), and
a WhatsApp bridge:

```
                           USER
                            │
                            ▼
                   ┌─────────────────┐
                   │     TONY AI     │
                   │ CEO ORCHESTRATOR│
                   └─────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
    RESEARCH             ENGINEERING        MARKETING
    TEAM                 TEAM               TEAM
    (Sherlock)           (Forge)            (Pulse)
         │                  │                  │
         ▼                  ▼                  ▼
  BUSINESS TEAM        AI TEAM            DESIGN TEAM
  (Venture)            (Neural)            (Pixel)
         │                  │                  │
         └──────────────┬───┘──────────────────┘
                        ▼
               OPERATIONS TEAM
                   (Flow)
                        │
               SALES TEAM
                   (Hunter)
                        │
           LEGAL & COMPLIANCE TEAM
                  (Guardian)
                        │
                        ▼
               TONY FINAL RESPONSE
         (Validation + Intelligence Layer)
```

## Contents

- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [1. Get the code ready](#1-get-the-code-ready)
- [2. Add your OpenAI API key](#2-add-your-openai-api-key)
- [3. Run it — pick a mode](#3-run-it--pick-a-mode)
  - [A. CLI](#a-cli-fastest-way-to-test)
  - [B. Web dashboard](#b-web-dashboard-recommended)
  - [C. WhatsApp](#c-whatsapp)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)
- [Extending it](#extending-it)

---

## How it works

1. You give Tony a task/request.
2. Three tracks run **in parallel**, each internally sequential:
   - `Research (Sherlock) → Business (Venture)`
   - `Engineering (Forge) → AI Team (Neural)`
   - `Marketing (Pulse) → Design (Pixel)`
3. All three tracks converge and feed into `Operations (Flow)`.
4. Operations' output feeds `Sales (Hunter)`.
5. Sales' output feeds `Legal & Compliance (Guardian)` for a risk pass.
6. Tony reads every team's output and produces one synthesized **final
   response** — the validation + intelligence layer — instead of just
   concatenating reports.

Each "team" is a `BaseAgent` subclass (see `teams/`) with its own persona
system prompt, calling the OpenAI API (`gpt-4o` by default).
Teams downstream in a track receive upstream teams' output as context, so
e.g. Business sees Research's findings, AI Team sees Engineering's plan,
Design sees Marketing's positioning, and Operations/Sales/Legal see
everything gathered so far.

---

## Prerequisites

You'll need, at minimum:

| Tool | Needed for | Check you have it |
|---|---|---|
| **Python 3.9+** | Everything (CLI, API, web UI) | `python3 --version` |
| **pip** | Installing Python dependencies | `pip3 --version` |
| **An OpenAI API key** | Real (non-stub) answers from every team | Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Node.js 18+** *(optional)* | Only if you want the WhatsApp bridge | `node --version` |

No API key yet? You can still run everything — see the stub-mode note below.

---

## 1. Get the code ready

Unzip the project and open a terminal in it:

```bash
unzip tony_ai.zip
cd tony_ai
```

Create a virtual environment and install the Python dependencies:

```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 2. Add your OpenAI API key

```bash
cp .env.example .env
```

Open `.env` and paste your key:

```
OPENAI_API_KEY=sk-your-real-key-here
```

Then load it into your shell session:

```bash
export $(cat .env | xargs)        # macOS / Linux
```

On Windows PowerShell, instead run:

```powershell
$env:OPENAI_API_KEY = "sk-your-real-key-here"
```

**No API key?** Every team automatically falls back to a stub response
(`[CODENAME STUB OUTPUT — no OPENAI_API_KEY configured]`) so you can
still see the entire pipeline run end-to-end, the dashboard light up, and
the WhatsApp bridge reply — just without real AI-generated content.

---

## 3. Run it — pick a mode

You can use any or all of these at once; they all share the same backend.

### A. CLI (fastest way to test)

```bash
python main.py "Should we build a subscription meal-planning app?"
```

Save the full trace (every team's raw output, not just the final answer)
as JSON:

```bash
python main.py "Should we build a subscription meal-planning app?" --out result.json
```

Suppress the progress logging and just print the final answer:

```bash
python main.py "..." --quiet
```

### B. Web dashboard (recommended)

This starts a local server that hosts both the JSON API and the dashboard:
a chat/voice interface for normal conversation, plus a live "agent room"
feed that appears in the transcript whenever a full-team deep dive runs.

```bash
uvicorn server:app --port 8420
```

Then open **http://localhost:8420** in your browser. Type or speak a
request — for anything that warrants the full team (say "ask the team", or
tap the team button), watch each specialist's message appear live in the
agent room, ending with the CEO's synthesized answer.

Want it to reload automatically while you edit the code?

```bash
uvicorn server:app --reload --port 8420
```

The dashboard itself lives in `web/`, a React 19 + TypeScript + Tailwind v4
app (built with Vite). The `frontend/` directory checked in at the repo root
is its **compiled output** — `uvicorn` just serves those static files — so
you don't need Node installed to run Tony day-to-day, only to change the UI.

**Developing the UI** — run the backend and a hot-reloading dev server side
by side:

```bash
# terminal 1
uvicorn server:app --reload --port 8420

# terminal 2
cd web
npm install   # first time only
npm run dev
```

Open the URL Vite prints (typically **http://localhost:5173**); it proxies
`/tony`, `/run`, `/skills`, `/companions`, `/knowledge`, `/device`,
`/integrations`, `/health`, and `/whatsapp` to the FastAPI server on 8420, so
API calls behave exactly like production while you get instant reload.

**Shipping a UI change** — build it back into `frontend/` and let uvicorn
serve the result:

```bash
cd web
npm run build
```

Then just run `uvicorn server:app --port 8420` as usual — no separate step
needed, no Node required on the machine that runs it.

Prefer to hit the API directly instead of the UI?

```bash
curl -X POST http://localhost:8420/run \
  -H "Content-Type: application/json" \
  -d '{"task": "Should we launch a B2B pricing tier?"}'
```

This returns JSON with every team's individual output plus Tony's
synthesized `final_response`. There's also `/run/stream` (Server-Sent
Events — what the web UI actually uses) if you want to build your own
front end.

### C. WhatsApp

Message Tony from your phone. This uses `whatsapp-web.js`, which logs in
as a linked device — just like scanning WhatsApp Web on a laptop, no
business account or approval process needed.

**Step 1 — make sure the backend from part B is running** (in a separate
terminal, leave it running):

```bash
uvicorn server:app --port 8420
```

**Step 2 — install and start the bridge:**

```bash
cd whatsapp-bridge
npm install
npm start
```

**Step 3 — a QR code prints in your terminal.** On your phone:
`WhatsApp → Settings → Linked Devices → Link a Device` → scan it.

**Step 4 — message yourself on WhatsApp:**

```
/tony Should we launch a subscription meal-planning app?
```

Tony routes it through the full pipeline and replies in that same chat
(splitting the reply into multiple messages if it's long). Your login is
cached locally in `.wwebjs_auth/`, so you only scan the QR code once.

Full details, including how to restrict the bot to only your own chat and
how to switch to the official WhatsApp Business Cloud API instead, are in
[`whatsapp-bridge/README.md`](whatsapp-bridge/README.md).

---

## Skills, Knowledge Base & Integrations

Every companion (Tony and the 11 pipeline agents) can be assigned any
combination of **skills** from the dashboard's settings panel — live
lookups (weather, Wikipedia, currency, facts), device actions (Apple
Music, WhatsApp drafts, email drafts, calendar events, restaurant search —
macOS only, AppleScript-based), and Gmail sending. Assignments are saved
to `data/companion_skills.json` and take effect immediately, no restart.

Anything that changes state outside the chat — playing music, drafting a
message, sending an email — always stops and asks the user to confirm
before it runs. An agent proposing an action and an agent *taking* one are
two different, deliberately separated steps (see `/device/execute` in
`server.py`).

**Knowledge Base**: short notes you want every companion to always have,
shown as a network graph in settings — drag nodes, click one to read the
full text or delete it. Edges are real: computed from actual shared
keywords between entries, not decorative. Saved to `data/knowledge.json`,
injected into every companion's system prompt.

**Gmail integration**: sending real email requires your own Google OAuth
credentials (Google requires every application to register its own —
there's no way around this):

1. https://console.cloud.google.com/apis/credentials → Create Credentials
   → OAuth client ID → Application type "Web application"
2. Add `http://localhost:8420/integrations/gmail/callback` as an
   authorized redirect URI
3. https://console.cloud.google.com/apis/library/gmail.googleapis.com →
   Enable
4. Put the Client ID/Secret in `.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`, restart the server
5. Settings → Integrations → Connect

Until that's done, the Connect button stays disabled and says so — it
never pretends to work without real credentials.

**Restaurant bookings**: there's no consumer API for actually completing
a reservation — OpenTable/Resy only offer that to registered restaurant
partners. The `open_restaurant_booking` skill opens an OpenTable search
pre-filled with what you asked for; you finish picking a time yourself.

---

## Project layout

```
tony_ai/
├── main.py                 CLI entry point
├── server.py                FastAPI server: JSON API, SSE stream, web UI, WhatsApp endpoint
├── orchestrator.py           TonyAI class: wires the pipeline together
├── skills.py                 Unified skill registry (tools.py + device_actions.py + gmail_integration.py)
├── companion_config.py       Per-companion skill assignments + knowledge base persistence
├── tools.py                   Public-API skills: weather, Wikipedia, currency, facts
├── device_actions.py          macOS AppleScript skills: music, apps, WhatsApp, email, calendar, booking search
├── gmail_integration.py       Gmail OAuth2 + REST API (send_gmail skill)
├── teams/
│   ├── base_agent.py         Shared BaseAgent + TeamResult + skill/confirmation resolution
│   ├── definitions.py         One class per team (Sherlock, Forge, Pulse, ...)
│   └── __init__.py
├── frontend/                  Compiled dashboard (built output of web/ — do not hand-edit)
├── web/                        Dashboard source: React 19 + TypeScript + Tailwind v4 (Vite)
│   ├── src/components/          Panels (chat, dock, settings, ...) + the Three.js world view
│   ├── src/hooks/                Voice I/O, gesture control, theme, health polling, ...
│   ├── src/lib/                   API client, agent metadata, shared types
│   └── vite.config.ts            Builds to ../frontend, dev-proxies API calls to :8420
├── whatsapp-bridge/
│   ├── index.js                WhatsApp <-> Tony AI bridge (whatsapp-web.js, QR login)
│   ├── package.json
│   └── README.md
├── data/                      Runtime-created: companion_skills.json, knowledge.json, gmail_token.json
├── requirements.txt
├── .env.example
└── README.md                  You are here
```

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'openai'` (or fastapi/uvicorn)**
Your virtual environment isn't active, or `pip install -r requirements.txt`
didn't finish. Run `source venv/bin/activate` again, then reinstall.

**Every team says "STUB OUTPUT"**
`OPENAI_API_KEY` isn't set in the terminal you're running from. Re-run
the `export $(cat .env | xargs)` step in that exact terminal, or check
`echo $OPENAI_API_KEY` prints your key.

**The web dashboard's status dot in the header stays gray**
The page is open but can't reach the FastAPI server. Make sure
`uvicorn server:app --port 8420` is actually running, and that you opened
`http://localhost:8420` (not a different port).

**`Address already in use` when starting uvicorn**
Something else is already using port 8420. Either stop it, or run on a
different port: `uvicorn server:app --port 8421` (and open that port in
your browser instead).

**WhatsApp bridge: QR code won't scan / times out**
Make sure you're scanning fast enough (they expire after ~60 seconds) —
just restart `npm start` for a fresh one. Also confirm Node.js is 18+
(`node --version`).

**WhatsApp bridge replies "Tony AI backend returned an error"**
The FastAPI server (part B) isn't running, or `TONY_API_URL`/`TONY_FULL_URL`
doesn't match the port you started it on. Check both terminals are up.

**Responses feel slow**
Normal conversation is one OpenAI call (quick mode) and should feel
instant. A full-team deep dive is a different story: eleven specialist
calls plus the CEO's synthesis is twelve calls per request. The three
tracks run in parallel to cut this down, but it can still take a while
depending on model load — that's expected for deep dive, not a bug.

---

## Extending it

- **Add a team:** subclass `BaseAgent` in `teams/definitions.py` with a
  `team_name`, `codename`, and `system_prompt`, then wire it into
  `orchestrator.py` — and add a matching entry to `AGENT_META` in
  `web/src/lib/agents.ts` (then `npm run build` in `web/`) if you want it to
  show up in the agent room too.
- **Change the topology:** the three parallel tracks and the convergence
  chain are plain Python in `TonyAI.run()` — reorder or branch however you
  like.
- **Swap the model:** set `model = "..."` on any `BaseAgent` subclass to
  use a different OpenAI model per team.
- **Add a public API tool:** add a function + OpenAI tool schema to
  `tools.py`, then set `tools = TOOL_SCHEMAS` (or your own list) on any
  `BaseAgent` subclass that should be able to call it.
