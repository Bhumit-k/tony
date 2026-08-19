import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Header from "@/components/panels/Header";
import ChatPanel from "@/components/panels/ChatPanel";
import Transcript from "@/components/panels/Transcript";
import Composer from "@/components/panels/Composer";
import Dock from "@/components/panels/Dock";
import SettingsSheet from "@/components/panels/SettingsSheet";
import GesturePreview from "@/components/panels/GesturePreview";
import WorldView from "@/components/world/WorldView";
import OrbFallback from "@/components/world/OrbFallback";

import { useTheme } from "@/hooks/useTheme";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useHealth } from "@/hooks/useHealth";
import { useOrb } from "@/hooks/useOrb";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useVoiceOutput } from "@/hooks/useVoiceOutput";
import { useGesture } from "@/hooks/useGesture";
import { useBroadcastSync } from "@/hooks/useBroadcastSync";
import { useResizablePanel } from "@/hooks/useResizablePanel";

import { supportsWebGL } from "@/lib/webgl";
import { AGENT_META, FULL_TEAM_PHRASES } from "@/lib/agents";
import { askQuick, deviceExecute, streamFullTeam, type ChatTurn } from "@/lib/api";
import type { AgentRoomMessage, ChatMessage } from "@/lib/types";
import type { TonyWorldHandle } from "@/lib/worldApi";

const MAX_HISTORY_TURNS = 12;

function sanitizeName(n: string): string {
  return (n || "").replace(/[<>]/g, "").trim().slice(0, 40) || "Tony";
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

export default function App() {
  const popout = useMemo(
    () => new URLSearchParams(window.location.search).get("popout") === "1",
    []
  );

  const { theme, toggleTheme } = useTheme();
  const online = useHealth();

  const [assistantNameRaw, setAssistantNameRaw] = useLocalStorage("tony-name", "Tony");
  const assistantName = sanitizeName(assistantNameRaw);
  const setAssistantName = useCallback(
    (n: string) => setAssistantNameRaw(sanitizeName(n)),
    [setAssistantNameRaw]
  );

  const [noWebgl, setNoWebgl] = useState(() => !supportsWebGL());
  const worldRef = useRef<TonyWorldHandle | null>(null);
  const { orbState, orbStateRef, setOrbState, setAmp } = useOrb(worldRef);

  useEffect(() => {
    worldRef.current?.setName(assistantName);
  }, [assistantName]);

  // ---- transcript ----
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const historyRef = useRef<ChatTurn[]>([]);
  const processingRef = useRef(false);

  const { broadcastBubble } = useBroadcastSync((msg) => {
    setMessages((prev) => [...prev, { kind: "bubble", id: nextId("sync"), who: msg.who, text: msg.text }]);
  });

  const addBubble = useCallback(
    (who: "you" | "tony", text: string) => {
      setMessages((prev) => [...prev, { kind: "bubble", id: nextId("b"), who, text }]);
      broadcastBubble(who, text);
    },
    [broadcastBubble]
  );

  // ---- settings / toggles ----
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullTeamOn, setFullTeamOn] = useState(false);
  const [voiceLoopOn, setVoiceLoopOn] = useState(false);
  const [gestureOn, setGestureOn] = useState(false);

  // ---- voice output ----
  const voiceOutput = useVoiceOutput(setAmp, () => setOrbState("speaking"));

  // useOrb's setOrbState signature doesn't take a message; keep a side
  // channel for the error detail text shown under the orb / dock status.
  const [errorDetail, setErrorDetailState] = useState("");
  const setOrbStateWithDetail = useCallback(
    (s: Parameters<typeof setOrbState>[0], detail?: string) => {
      if (s === "error") setErrorDetailState(detail || "something went wrong — tap the mic to retry");
      setOrbState(s);
    },
    [setOrbState]
  );

  // ---- voice input ----
  const handleFinalResult = useRef<(text: string) => void>(() => {});
  const voiceInput = useVoiceInput({
    onFinalResult: (text) => {
      addBubble("you", text);
      handleFinalResult.current(text);
    },
    onListeningStart: () => setOrbState("listening"),
    onListeningEnd: () => {
      if (voiceLoopOn && orbStateRef.current !== "thinking" && orbStateRef.current !== "speaking") {
        setTimeout(() => {
          if (voiceLoopOn) voiceInputStartRef.current();
        }, 350);
      } else if (orbStateRef.current === "listening") {
        setOrbState("idle");
      }
    },
    onError: (message) => setOrbStateWithDetail("error", message),
    onAmp: setAmp,
    voiceLoopOn,
    beforeStart: () => voiceOutput.cancel(),
  });
  const voiceInputStartRef = useRef(voiceInput.start);
  voiceInputStartRef.current = voiceInput.start;

  // ---- gesture (wave-to-talk) ----
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const gesture = useGesture(videoEl, () => {
    if (voiceInput.supported) {
      if (orbStateRef.current === "listening") voiceInput.stop();
      else if (["idle", "error", "speaking"].includes(orbStateRef.current)) voiceInput.start();
    }
  });

  useEffect(() => {
    if (gestureOn) gesture.start();
    else gesture.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestureOn]);

  // ---- resizable panel ----
  const { width: panelWidth, startDrag } = useResizablePanel();

  // ---- core: quick chat ----
  const askQuickFlow = useCallback(
    async (task: string) => {
      setOrbStateWithDetail("thinking");
      try {
        const data = await askQuick(task, historyRef.current, assistantName);
        if (data.error) throw new Error(data.error);
        const reply = data.reply || "I didn't get anything back — try again.";
        historyRef.current = [
          ...historyRef.current,
          { role: "user" as const, content: task },
          { role: "assistant" as const, content: reply },
        ].slice(-MAX_HISTORY_TURNS * 2);
        return { text: reply, pendingAction: data.metadata?.pending_action || null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        return {
          text: `I can't reach the backend right now (${message}). Start it with "uvicorn server:app --port 8420" from the project folder.`,
          pendingAction: null,
        };
      }
    },
    [assistantName, setOrbStateWithDetail]
  );

  // ---- core: full team deep dive ----
  const askFullTeamFlow = useCallback(
    async (task: string) => {
      setOrbStateWithDetail("thinking");
      const roomId = nextId("room");
      const room: AgentRoomMessage = {
        kind: "agent-room",
        id: roomId,
        assistantName,
        status: "running",
        headline: `${assistantName} is assembling the team…`,
        rows: [],
      };
      setMessages((prev) => [...prev, room]);

      const patchRoom = (patch: Partial<AgentRoomMessage>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === roomId && m.kind === "agent-room" ? { ...m, ...patch } : m))
        );
      };
      const rows: AgentRoomMessage["rows"] = [];
      let finalText: string | null = null;

      try {
        for await (const ev of streamFullTeam(task, assistantName)) {
          if (ev.type === "stage" && ev.stage === "tracks_started") {
            worldRef.current?.broadcastPulse();
          }
          if (ev.type === "team_done" && !ev.error && ev.codename && ev.output) {
            const meta = AGENT_META[ev.codename] || { role: ev.team_name || "", color: "#8E8E93" };
            worldRef.current?.pulseCompanion(ev.codename);
            rows.push({ codename: ev.codename, role: meta.role, color: meta.color, output: ev.output, verdict: ev.verdict });
            patchRoom({ rows: [...rows] });
          }
          if (ev.type === "alert" && ev.codename && ev.verdict) {
            worldRef.current?.flashAlert(ev.codename);
            patchRoom({ headline: `Flagged: ${ev.codename} — ${ev.verdict.replace(/-/g, " ").toLowerCase()}` });
          }
          if (ev.type === "final") finalText = ev.final_response || null;
          if (ev.type === "error") throw new Error(ev.error || "pipeline error");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        finalText = `I can't reach the backend right now (${message}).`;
      }

      worldRef.current?.pulseFinal();
      patchRoom({
        status: "done",
        headline: `${assistantName} — CEO synthesis (${rows.length} agents consulted)`,
        ceo: { name: assistantName, output: finalText || "No response produced." },
      });

      return finalText || "The team finished but produced no final response — try again.";
    },
    [assistantName, setOrbStateWithDetail]
  );

  const handleUtterance = useCallback(
    async (text: string) => {
      if (!text || processingRef.current) return;
      processingRef.current = true;
      voiceInput.stop();

      const useFullTeam = fullTeamOn || FULL_TEAM_PHRASES.test(text);
      let answer: string;
      if (useFullTeam) {
        answer = await askFullTeamFlow(text);
      } else {
        const { text: reply, pendingAction } = await askQuickFlow(text);
        addBubble("tony", reply);
        if (pendingAction) {
          setMessages((prev) => [
            ...prev,
            { kind: "confirm", id: nextId("confirm"), action: pendingAction, status: "pending" },
          ]);
        }
        answer = reply;
      }
      await voiceOutput.speak(answer);

      processingRef.current = false;
      if (voiceLoopOn) voiceInput.start();
      else setOrbStateWithDetail("idle");
    },
    [fullTeamOn, askFullTeamFlow, askQuickFlow, addBubble, voiceOutput, voiceLoopOn, voiceInput, setOrbStateWithDetail]
  );
  handleFinalResult.current = handleUtterance;

  const handleSend = useCallback(
    (text: string) => {
      addBubble("you", text);
      handleUtterance(text);
    },
    [addBubble, handleUtterance]
  );

  async function onConfirmAction(id: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && m.kind === "confirm" ? { ...m, status: "confirmed" } : m))
    );
    const msg = messages.find((m) => m.id === id);
    if (!msg || msg.kind !== "confirm") return;
    try {
      const result = await deviceExecute(msg.action);
      if (result.error) addBubble("tony", `That didn't work: ${result.error}`);
      else addBubble("tony", `Done — ${msg.action.label}.`);
    } catch (err) {
      addBubble("tony", `Couldn't run that: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  function onCancelAction(id: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && m.kind === "confirm" ? { ...m, status: "cancelled" } : m))
    );
  }

  function onMicClick() {
    if (!voiceInput.supported) return;
    if (orbStateRef.current === "listening") voiceInput.stop();
    else if (["idle", "error", "speaking"].includes(orbStateRef.current)) voiceInput.start();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.isContentEditable);
      if (e.code === "Space" && !isTyping) {
        e.preventDefault();
        onMicClick();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceInput.supported]);

  function onPopoutClick() {
    window.open(window.location.pathname + "?popout=1", "tonyChat", "width=440,height=720");
  }

  const dockStatus =
    orbState === "idle"
      ? "ready"
      : orbState === "listening"
      ? "listening…"
      : orbState === "thinking"
      ? `${assistantName} is thinking…`
      : orbState === "speaking"
      ? `${assistantName} is speaking…`
      : errorDetail;

  const showWorld = !popout && !noWebgl;
  const showFallbackOrb = noWebgl;

  return (
    <>
      {showWorld && (
        <WorldView
          ref={worldRef}
          initialName={assistantName}
          onUnavailable={() => setNoWebgl(true)}
        />
      )}

      <Header
        assistantName={assistantName}
        onNameChange={setAssistantName}
        online={online}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onPopout={onPopoutClick}
        showWorldChrome={!popout}
      />

      {!popout && !noWebgl && (
        <div
          className="fixed top-[70px] bottom-24 z-[11] w-2.5 max-md:hidden"
          style={{ right: `min(${panelWidth}px, calc(100vw - 32px))` }}
          onPointerDown={startDrag}
        >
          <div className="absolute top-1/2 right-[3px] h-9 w-[3px] -translate-y-1/2 rounded-sm bg-[var(--border-strong)]" />
        </div>
      )}

      <ChatPanel width={panelWidth} noWebgl={noWebgl} popout={popout}>
        {showFallbackOrb && <OrbFallback ref={worldRef} assistantName={assistantName} />}
        <Transcript messages={messages} onConfirmAction={onConfirmAction} onCancelAction={onCancelAction} />
        <Composer onSend={handleSend} showSuggestions={messages.length === 0} fullTeamOn={fullTeamOn} />
      </ChatPanel>

      {!popout && (
        <Dock
          micSupported={voiceInput.supported}
          listening={orbState === "listening"}
          onMicClick={onMicClick}
          muted={voiceOutput.muted}
          onMuteClick={voiceOutput.toggleMuted}
          gestureOn={gestureOn}
          onGestureClick={() => setGestureOn((v) => !v)}
          fullTeamOn={fullTeamOn}
          onFullTeamClick={() => setFullTeamOn((v) => !v)}
          statusText={dockStatus}
        />
      )}

      {!popout && <GesturePreview ref={setVideoEl} active={gesture.active} waveDetected={gesture.waveFlash} />}

      {!popout && (
        <SettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          assistantName={assistantName}
          onNameChange={setAssistantName}
          theme={theme}
          onToggleTheme={toggleTheme}
          voices={voiceOutput.voices}
          voiceName={voiceOutput.voiceName}
          setVoiceName={voiceOutput.setVoiceName}
          rate={voiceOutput.rate}
          setRate={voiceOutput.setRate}
          voiceLoopOn={voiceLoopOn}
          onToggleVoiceLoop={() => {
            setVoiceLoopOn((v) => {
              const next = !v;
              if (next && orbStateRef.current === "idle") voiceInput.start();
              return next;
            });
          }}
          fullTeamOn={fullTeamOn}
          onToggleFullTeam={() => setFullTeamOn((v) => !v)}
          gestureOn={gestureOn}
          onToggleGesture={() => setGestureOn((v) => !v)}
        />
      )}
    </>
  );
}
