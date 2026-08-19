# Tony AI — WhatsApp Bridge

Talk to Tony AI directly from WhatsApp on your phone. No business account,
no approval process — just scan a QR code like connecting WhatsApp Web.

## How it works

This uses [`whatsapp-web.js`](https://wwebjs.dev), an unofficial library
that automates the real WhatsApp Web client in a headless browser. It logs
in as a **linked device** on your existing WhatsApp account, the same way
opening web.whatsapp.com on a laptop does.

```
Your phone (WhatsApp)  <-->  This bridge (linked device)  <-->  Tony AI backend (localhost:8420)
```

## Setup

**1. Start the Tony AI backend first** (in the parent `tony_ai/` folder):

```bash
cd ..
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...
uvicorn server:app --port 8420
```

**2. Install and start the bridge:**

```bash
cd whatsapp-bridge
npm install
npm start
```

**3. A QR code prints in your terminal.** On your phone:
`WhatsApp → Settings → Linked Devices → Link a Device` → scan it.

**4. Tony messages you first.** As soon as it connects, the bridge sends a
"Tony AI is online" message into your own **Message Yourself** chat — that's
the chat to reply in. (A bot can't cold-open a chat with an arbitrary number;
sending into your own self-chat, which already exists, is how it makes
itself visible without that.)

Reply there with:

```
/tony what's a catchy subject line for a product launch email?
```

and Tony answers directly and fast — a single agent, no sub-teams, with
short-term memory of your last few messages in that chat. For a real
go/no-go decision that's worth the full multi-team pass, use:

```
/tony full Should we launch a subscription meal-planning app?
```

That routes through Research, Engineering, Marketing, Finance, Security,
Legal & every other team and replies with Tony's synthesized final call
(split into multiple messages if it's long) — it's slower, so it's opt-in
rather than the default.

Your login session is cached in `.wwebjs_auth/`, so you only need to scan
the QR code once — future restarts reconnect automatically.

## Config (optional environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `TONY_API_URL` | `http://localhost:8420/tony/quick` | Where default (fast) messages go |
| `TONY_FULL_URL` | `http://localhost:8420/whatsapp/message` | Where `/tony full ...` messages go |
| `TONY_TRIGGER_PREFIX` | `/tony` | Only messages starting with this get sent to Tony. Set to an empty string to respond to every message in an allowed chat. |
| `TONY_ALLOWED_CHAT_ID` | *(auto — your self-chat)* | Restrict responses to one chat ID. Left blank, the bridge auto-detects your own "Message Yourself" chat on connect so it never replies in group chats or to other contacts. |

Example — explicitly pin to a specific chat instead of the auto-detected one:

```bash
export TONY_ALLOWED_CHAT_ID="1234567890@c.us"
npm start
```

(You can find a chat's ID by logging `msg.from` in `index.js` once and
sending yourself a test message.)

## Notes & alternatives

- **This is unofficial.** `whatsapp-web.js` automates WhatsApp Web, which
  is against WhatsApp's Terms of Service in the strictest reading, though
  it's widely used for personal projects. Use a secondary number if you'd
  rather not risk your primary account, and don't use it for spam/bulk
  messaging.
- **Official alternative:** if you want something sanctioned by Meta, use
  the [WhatsApp Business Platform Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
  (free tier available) or [Twilio's WhatsApp API](https://www.twilio.com/whatsapp).
  Both require a Meta Business/Twilio account and a short approval step,
  but no QR-code session to keep alive. If you'd like, this project's
  `/whatsapp/message` endpoint on the backend works the same way regardless
  of which bridge sends the request — you'd just swap this folder for a
  small Twilio webhook handler instead.
