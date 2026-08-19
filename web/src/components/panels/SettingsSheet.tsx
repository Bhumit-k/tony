import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { Sheet, SheetSection, SheetRow } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import KnowledgeGraph from "@/components/panels/KnowledgeGraph";
import { ALL_COMPANIONS } from "@/lib/agents";
import { cn } from "@/lib/utils";
import {
  fetchSkills,
  fetchCompanionSkills,
  setCompanionSkills,
  fetchKnowledge,
  addKnowledge,
  deleteKnowledge,
  fetchGmailStatus,
  gmailConnect,
  gmailDisconnect,
  type Skill,
  type KnowledgeEntry,
  type GmailStatus,
} from "@/lib/api";
import type { VoiceOption } from "@/hooks/useVoiceOutput";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistantName: string;
  onNameChange: (name: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  voices: VoiceOption[];
  voiceName: string;
  setVoiceName: (n: string) => void;
  rate: number;
  setRate: (r: number) => void;
  voiceLoopOn: boolean;
  onToggleVoiceLoop: () => void;
  fullTeamOn: boolean;
  onToggleFullTeam: () => void;
  gestureOn: boolean;
  onToggleGesture: () => void;
}

export default function SettingsSheet({
  open,
  onOpenChange,
  assistantName,
  onNameChange,
  theme,
  onToggleTheme,
  voices,
  voiceName,
  setVoiceName,
  rate,
  setRate,
  voiceLoopOn,
  onToggleVoiceLoop,
  fullTeamOn,
  onToggleFullTeam,
  gestureOn,
  onToggleGesture,
}: SettingsSheetProps) {
  const [nameDraft, setNameDraft] = useState(assistantName);
  useEffect(() => setNameDraft(assistantName), [assistantName]);

  // ---- Skills ----
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [skillCompanion, setSkillCompanion] = useState("Tony");
  const [skillsError, setSkillsError] = useState(false);

  // ---- Knowledge base ----
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [kbInput, setKbInput] = useState("");
  const [kbLoaded, setKbLoaded] = useState(false);

  // ---- Gmail ----
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [gmailError, setGmailError] = useState(false);
  const gmailPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSkills = useCallback(async () => {
    try {
      const [skills, current] = await Promise.all([
        allSkills.length ? Promise.resolve(allSkills) : fetchSkills(),
        fetchCompanionSkills(),
      ]);
      setAllSkills(skills);
      setAssignments(current);
      setSkillsError(false);
    } catch {
      setSkillsError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadKnowledge = useCallback(async () => {
    try {
      const list = await fetchKnowledge();
      setEntries(list);
      setKbLoaded(true);
    } catch {
      setKbLoaded(false);
    }
  }, []);

  const loadGmail = useCallback(async () => {
    try {
      const status = await fetchGmailStatus();
      setGmail(status);
      setGmailError(false);
    } catch {
      setGmailError(true);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      if (gmailPollRef.current) clearInterval(gmailPollRef.current);
      return;
    }
    loadSkills();
    loadKnowledge();
    loadGmail();
  }, [open, loadSkills, loadKnowledge, loadGmail]);

  async function toggleSkill(skillId: string) {
    const current = new Set(assignments[skillCompanion] || []);
    if (current.has(skillId)) current.delete(skillId);
    else current.add(skillId);
    const updated = Array.from(current);
    setAssignments((prev) => ({ ...prev, [skillCompanion]: updated }));
    try {
      await setCompanionSkills(skillCompanion, updated);
    } catch (err) {
      console.warn("Failed to save skill assignment:", err);
    }
  }

  async function submitKnowledge() {
    const text = kbInput.trim();
    if (!text) return;
    setKbInput("");
    try {
      await addKnowledge(text);
      loadKnowledge();
    } catch (err) {
      console.warn("Failed to add knowledge entry:", err);
    }
  }

  async function removeKnowledge(id: string) {
    try {
      await deleteKnowledge(id);
      loadKnowledge();
    } catch (err) {
      console.warn("Failed to delete knowledge entry:", err);
    }
  }

  async function handleGmailClick() {
    if (gmail?.connected) {
      await gmailDisconnect();
      loadGmail();
      return;
    }
    try {
      const data = await gmailConnect();
      if (data.auth_url) {
        window.open(data.auth_url, "gmailAuth", "width=480,height=680");
        if (gmailPollRef.current) clearInterval(gmailPollRef.current);
        let checks = 0;
        gmailPollRef.current = setInterval(() => {
          checks++;
          loadGmail();
          if (checks > 20 && gmailPollRef.current) clearInterval(gmailPollRef.current);
        }, 2000);
      }
    } catch (err) {
      console.warn("Gmail connect failed:", err);
    }
  }

  const assigned = new Set(assignments[skillCompanion] || []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetSection title="Identity">
        <SheetRow label="Assistant name" description="Changes what it calls itself, everywhere">
          <Input
            value={nameDraft}
            maxLength={40}
            className="h-8 w-32 border-none text-right shadow-none focus-visible:ring-0"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => onNameChange(nameDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </SheetRow>
      </SheetSection>

      <SheetSection title="Appearance">
        <SheetRow label="Dark mode">
          <Switch checked={theme === "dark"} onCheckedChange={onToggleTheme} />
        </SheetRow>
      </SheetSection>

      <SheetSection title="Voice">
        <SheetRow label="Voice">
          <Select value={voiceName} onValueChange={setVoiceName}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              {voices.map((v) => (
                <SelectItem key={v.name} value={v.name}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SheetRow>
        <SheetRow label="Speaking rate">
          <Select value={String(rate)} onValueChange={(v) => setRate(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.85">Slower</SelectItem>
              <SelectItem value="1">Normal</SelectItem>
              <SelectItem value="1.2">Faster</SelectItem>
            </SelectContent>
          </Select>
        </SheetRow>
        <SheetRow label="Keep listening after replies">
          <Switch checked={voiceLoopOn} onCheckedChange={onToggleVoiceLoop} />
        </SheetRow>
      </SheetSection>

      <SheetSection title="Full team">
        <SheetRow
          label="Full team deep dive"
          description="Runs all 11 specialist agents instead of answering directly"
        >
          <Switch checked={fullTeamOn} onCheckedChange={onToggleFullTeam} />
        </SheetRow>
        <SheetRow
          label="Wave-to-talk"
          description="Webcam gesture control — nothing is recorded or uploaded"
        >
          <Switch checked={gestureOn} onCheckedChange={onToggleGesture} />
        </SheetRow>
      </SheetSection>

      <SheetSection title="Skills">
        <SheetRow label="Companion">
          <Select value={skillCompanion} onValueChange={setSkillCompanion}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_COMPANIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SheetRow>
        <div className="flex flex-wrap gap-2 py-2">
          {skillsError && (
            <div className="py-2 text-[12px] text-muted-foreground">
              Couldn't load skills — is the backend running?
            </div>
          )}
          {!skillsError &&
            allSkills.map((s) => {
              const on = assigned.has(s.id);
              return (
                <motion.button
                  key={s.id}
                  whileTap={{ scale: 0.96 }}
                  title={s.description || ""}
                  onClick={() => toggleSkill(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 pl-2 text-[12.5px]",
                    on
                      ? "border-accent bg-[var(--accent-soft)] text-foreground"
                      : "border-border bg-card text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      on ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
                    )}
                  />
                  {s.label}
                  {s.requires_confirmation && (
                    <span className="text-[9px] text-[var(--warn)]">confirm</span>
                  )}
                </motion.button>
              );
            })}
        </div>
      </SheetSection>

      <SheetSection title="Integrations">
        <SheetRow
          label="Gmail"
          description={
            gmailError
              ? "Couldn't check — is the backend running?"
              : !gmail
              ? "Checking…"
              : !gmail.configured
              ? "Needs Google API credentials in .env first — see gmail_integration.py"
              : gmail.connected
              ? `Connected as ${gmail.email || "your account"}`
              : "Not connected"
          }
        >
          <Button
            size="sm"
            variant="outline"
            disabled={!gmail?.configured}
            className={cn(gmail?.connected && "text-destructive")}
            onClick={handleGmailClick}
          >
            {gmail?.connected ? "Disconnect" : "Connect"}
          </Button>
        </SheetRow>
      </SheetSection>

      <SheetSection title="Knowledge base">
        <div className="flex gap-2 pb-2.5">
          <Input
            value={kbInput}
            onChange={(e) => setKbInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitKnowledge();
              }
            }}
            maxLength={300}
            placeholder="Add something it should always know…"
            className="rounded-lg bg-muted"
          />
          <Button size="sm" className="rounded-lg" onClick={submitKnowledge}>
            Add
          </Button>
        </div>
        {kbLoaded ? (
          <KnowledgeGraph entries={entries} onDelete={removeKnowledge} />
        ) : (
          <div className="py-2.5 text-[12px] text-muted-foreground">
            Couldn't load the knowledge base — is the backend running?
          </div>
        )}
      </SheetSection>

      <div className="pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Live knowledge comes from a few free public APIs (weather, Wikipedia, currency, facts),
        called only when a question needs current or verifiable data. Device actions (Apple
        Music, WhatsApp, email, calendar, restaurant search) only run where supported and always
        ask you to confirm first — nothing executes silently, and restaurant search opens
        OpenTable pre-filled rather than booking automatically (no consumer API exists for that).
        Gmail requires connecting your own account above. Voice recognition uses your browser's
        built-in Speech API — nothing is recorded or stored.
      </div>
    </Sheet>
  );
}
