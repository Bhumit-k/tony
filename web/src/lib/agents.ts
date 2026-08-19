// Fixed companion roster + metadata, shared between the chat "agent room"
// card, the settings skills picker, and the 3D world view.

export interface CompanionMeta {
  role: string;
  color: string;
}

export const AGENT_META: Record<string, CompanionMeta> = {
  Sherlock: { role: "Research", color: "#5E8BFF" },
  Venture: { role: "Business", color: "#34C759" },
  Ledger: { role: "Finance", color: "#30B0C7" },
  Forge: { role: "Engineering", color: "#FF9500" },
  Neural: { role: "AI Team", color: "#AF52DE" },
  Pulse: { role: "Marketing", color: "#FF2D55" },
  Pixel: { role: "Design", color: "#5856D6" },
  Flow: { role: "Operations", color: "#64D2FF" },
  Hunter: { role: "Sales", color: "#FFD60A" },
  Sentinel: { role: "Security", color: "#8E8E93" },
  Guardian: { role: "Legal & Compliance", color: "#FF3B30" },
};

// Muted/desaturated variant used inside the 3D scene, so the world reads
// quieter than the app chrome (Tony keeps the single dominant accent).
export const COMPANION_WORLD_COLORS: Record<string, string> = {
  Sherlock: "#6E8FE0",
  Venture: "#57B08C",
  Ledger: "#4FADBE",
  Forge: "#D6935A",
  Neural: "#9A83CC",
  Pulse: "#CC6E8C",
  Pixel: "#7C7ECC",
  Flow: "#5FA6C2",
  Hunter: "#C2A85A",
  Sentinel: "#8E8E93",
  Guardian: "#C46464",
};

export const COMPANION_ORDER = Object.keys(AGENT_META);
export const ALL_COMPANIONS = ["Tony", ...COMPANION_ORDER];

export function initials(name: string): string {
  return (name || "?").slice(0, 2).toUpperCase();
}

export const FULL_TEAM_PHRASES =
  /\b(ask the team|full team|deep dive|everyone'?s opinion|whole team|get the team)\b/i;
