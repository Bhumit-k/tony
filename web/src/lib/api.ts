// Thin fetch wrappers around the Tony backend. All paths are relative so
// the Vite dev-server proxy (see vite.config.ts) forwards them to
// http://localhost:8420 in development, and same-origin in production.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PendingAction {
  name: string;
  label: string;
  arguments: Record<string, unknown>;
}

export interface QuickReply {
  reply?: string;
  error?: string;
  metadata?: { pending_action?: PendingAction | null };
}

export async function askQuick(
  task: string,
  history: ChatTurn[],
  assistantName: string
): Promise<QuickReply> {
  const res = await fetch("/tony/quick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, history, assistant_name: assistantName }),
  });
  if (!res.ok) throw new Error(`backend returned ${res.status}`);
  return res.json();
}

export async function deviceExecute(action: PendingAction) {
  const res = await fetch("/device/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: action.name, arguments: action.arguments }),
  });
  return res.json();
}

export interface StreamEvent {
  type: "stage" | "team_done" | "alert" | "final" | "error";
  stage?: string;
  codename?: string;
  team_name?: string;
  output?: string;
  verdict?: string;
  final_response?: string;
  error?: string;
}

export async function* streamFullTeam(
  task: string,
  assistantName: string,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const res = await fetch("/run/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, assistant_name: assistantName }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("backend unreachable");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const dataLine = line.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload) continue;
      try {
        yield JSON.parse(payload) as StreamEvent;
      } catch {
        // ignore malformed frame
      }
    }
  }
}

export interface Skill {
  id: string;
  label: string;
  description?: string;
  requires_confirmation?: boolean;
}

export async function fetchSkills(): Promise<Skill[]> {
  const res = await fetch("/skills");
  const data = await res.json();
  return data.skills || [];
}

export async function fetchCompanionSkills(): Promise<Record<string, string[]>> {
  const res = await fetch("/companions/skills");
  return res.json();
}

export async function setCompanionSkills(codename: string, skillIds: string[]) {
  return fetch("/companions/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codename, skill_ids: skillIds }),
  });
}

export interface KnowledgeEntry {
  id: string;
  text: string;
}

export async function fetchKnowledge(): Promise<KnowledgeEntry[]> {
  const res = await fetch("/knowledge");
  const data = await res.json();
  return data.entries || [];
}

export async function addKnowledge(text: string) {
  return fetch("/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function deleteKnowledge(id: string) {
  return fetch(`/knowledge/${id}`, { method: "DELETE" });
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
}

export async function fetchGmailStatus(): Promise<GmailStatus> {
  const res = await fetch("/integrations/gmail/status");
  return res.json();
}

export async function gmailConnect(): Promise<{ auth_url?: string }> {
  const res = await fetch("/integrations/gmail/connect");
  return res.json();
}

export async function gmailDisconnect() {
  return fetch("/integrations/gmail/disconnect", { method: "POST" });
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch("/health");
    return res.ok;
  } catch {
    return false;
  }
}
