/**
 * Tony AI — WhatsApp Bridge
 *
 * Connects your personal WhatsApp (via QR-code login, exactly like
 * WhatsApp Web in a browser) to the local Tony AI orchestrator.
 *
 * How it works:
 *   1. You run `npm start` here.
 *   2. A QR code prints in the terminal.
 *   3. On your phone: WhatsApp -> Settings -> Linked Devices -> Link a Device
 *      -> scan the QR code.
 *   4. As soon as it connects, Tony sends YOU a WhatsApp message ("I'm
 *      online...") in your own "Message Yourself" chat — that's how you
 *      know it's working and where the conversation is.
 *   5. Reply in that same chat with "/tony <anything>" and Tony answers
 *      directly and fast (single agent, no sub-teams). Use
 *      "/tony full <task>" instead when you actually want the full
 *      11-agent pipeline (Research through Legal & Compliance) — that's
 *      slower and is for real go/no-go decisions, not routine chat.
 *
 * IMPORTANT: WhatsApp bots can't "open a chat" out of nowhere or message an
 * arbitrary number cold — that's not something this library (or WhatsApp)
 * allows, for good reason (it'd be spam). What it CAN do is message chats
 * that already exist, which is exactly what the startup greeting below
 * does: it sends the first message in your own self-chat so you have
 * something to reply to.
 *
 * This uses whatsapp-web.js, an unofficial library that automates the real
 * WhatsApp Web client. It's the easiest way to connect a personal WhatsApp
 * account without applying for the official WhatsApp Business Cloud API.
 * Keep in mind:
 *   - It's unofficial — WhatsApp could change something and break it.
 *   - Best used with a secondary/non-critical WhatsApp number if possible.
 *   - Session data (the login) is cached locally in .wwebjs_auth/ so you
 *     only need to scan the QR code once.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');

// ---------------- Config ----------------
// Default target is the FAST single-agent endpoint — normal chat should
// never spin up all 11 teams. "/tony full ..." below overrides this per-message.
const TONY_QUICK_URL = process.env.TONY_API_URL || 'http://localhost:8420/tony/quick';
const TONY_FULL_URL = process.env.TONY_FULL_URL || 'http://localhost:8420/whatsapp/message';
// Only messages starting with this prefix get sent to Tony (so normal chats
// aren't accidentally hijacked). Set to '' to respond to every message.
const TRIGGER_PREFIX = process.env.TONY_TRIGGER_PREFIX ?? '/tony';
// The sub-command that routes to the full multi-team pipeline instead of
// the fast single-agent reply, e.g. "/tony full should we launch X".
const FULL_PIPELINE_KEYWORD = 'full';
// If set, only this chat ID gets a response. Leave blank and the bridge
// auto-targets your own "Message Yourself" chat once connected.
let ALLOWED_CHAT_ID = process.env.TONY_ALLOWED_CHAT_ID || '';
// Per-chat rolling history for /tony/quick's multi-turn memory (in-memory only).
const HISTORY = new Map(); // chatId -> [{role, content}, ...]
const MAX_HISTORY_TURNS = 12;

// ---------------- Client setup ----------------
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('\nScan this QR code with WhatsApp -> Linked Devices -> Link a Device:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('✅ WhatsApp bridge connected. Listening for messages...');
  console.log(`   Trigger prefix: "${TRIGGER_PREFIX || '(none — replies to everything)'}"`);
  console.log(`   Quick endpoint: ${TONY_QUICK_URL}`);
  console.log(`   Full endpoint:  ${TONY_FULL_URL}`);

  // This is the fix for "nothing happens after the QR scan": the bot can't
  // spontaneously open a new chat with an arbitrary number, but it CAN send
  // the first message into your own self-chat, which always exists.
  try {
    const selfId = client.info.wid._serialized;
    if (!ALLOWED_CHAT_ID) ALLOWED_CHAT_ID = selfId;
    await client.sendMessage(
      selfId,
      `🧑\u200d💼 Tony AI is online.\n\nReply here with "${TRIGGER_PREFIX} <anything>" and I'll answer directly.\nUse "${TRIGGER_PREFIX} ${FULL_PIPELINE_KEYWORD} <task>" for the full team deep-dive (Research, Engineering, Marketing, Finance, Security, Legal & more).`
    );
    console.log(`   Sent startup greeting to your self-chat (${selfId}).`);
  } catch (err) {
    console.warn('⚠️  Could not send the startup greeting:', err.message);
  }
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️  WhatsApp disconnected:', reason);
});

client.on('message', async (msg) => {
  try {
    if (ALLOWED_CHAT_ID && msg.from !== ALLOWED_CHAT_ID) return;

    const body = (msg.body || '').trim();
    if (TRIGGER_PREFIX && !body.toLowerCase().startsWith(TRIGGER_PREFIX.toLowerCase())) {
      return;
    }
    let task = TRIGGER_PREFIX ? body.slice(TRIGGER_PREFIX.length).trim() : body;
    if (!task) {
      await msg.reply(`Send a task after "${TRIGGER_PREFIX}", e.g.\n${TRIGGER_PREFIX} what's a good subject line for a product launch email?`);
      return;
    }

    const isFullPipeline = new RegExp(`^${FULL_PIPELINE_KEYWORD}\\b`, 'i').test(task);
    if (isFullPipeline) {
      task = task.replace(new RegExp(`^${FULL_PIPELINE_KEYWORD}\\b`, 'i'), '').trim();
      if (!task) {
        await msg.reply(`Send a task after "${TRIGGER_PREFIX} ${FULL_PIPELINE_KEYWORD}", e.g.\n${TRIGGER_PREFIX} ${FULL_PIPELINE_KEYWORD} Should we launch a subscription meal-planning app?`);
        return;
      }
      await msg.reply('🧑\u200d💼 Running the full team deep-dive — Research, Engineering, Marketing, Finance, Security, Legal & more. This takes longer...');

      const res = await fetch(TONY_FULL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      if (!res.ok) {
        await msg.reply(`⚠️ Tony AI backend returned an error (HTTP ${res.status}). Is the server running at ${TONY_FULL_URL}?`);
        return;
      }
      const data = await res.json();
      const reply = data.reply || '(no response produced)';
      for (const chunk of splitMessage(reply, 3500)) await msg.reply(chunk);
      return;
    }

    // ---- Default: fast single-agent reply, with per-chat rolling memory ----
    const history = HISTORY.get(msg.from) || [];
    const res = await fetch(TONY_QUICK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, history }),
    });

    if (!res.ok) {
      await msg.reply(`⚠️ Tony AI backend returned an error (HTTP ${res.status}). Is the server running at ${TONY_QUICK_URL}?`);
      return;
    }

    const data = await res.json();
    const reply = data.reply || '(no response produced)';

    history.push({ role: 'user', content: task }, { role: 'assistant', content: reply });
    HISTORY.set(msg.from, history.slice(-MAX_HISTORY_TURNS * 2));

    const chunks = splitMessage(reply, 3500);
    for (const chunk of chunks) {
      await msg.reply(chunk);
    }
  } catch (err) {
    console.error('Error handling message:', err);
    try {
      await msg.reply(`❌ Something went wrong talking to Tony AI: ${err.message}`);
    } catch (_) { /* ignore */ }
  }
});

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

client.initialize();
