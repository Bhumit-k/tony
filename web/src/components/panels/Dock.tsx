import { motion } from "motion/react";
import { Hand, Mic, MicOff, Users, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";

interface DockProps {
  micSupported: boolean;
  listening: boolean;
  onMicClick: () => void;
  muted: boolean;
  onMuteClick: () => void;
  gestureOn: boolean;
  onGestureClick: () => void;
  fullTeamOn: boolean;
  onFullTeamClick: () => void;
  statusText: string;
}

export default function Dock({
  micSupported,
  listening,
  onMicClick,
  muted,
  onMuteClick,
  gestureOn,
  onGestureClick,
  fullTeamOn,
  onFullTeamClick,
  statusText,
}: DockProps) {
  return (
    <div className="glass fixed bottom-[18px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-[30px] px-3 py-2.5 shadow-lg">
      <button
        disabled={!micSupported}
        title={micSupported ? "Speak (space)" : "Voice input needs Chrome, Edge, or Safari"}
        onClick={onMicClick}
        className={cn(
          "relative flex size-[42px] items-center justify-center rounded-full border transition-colors active:scale-[0.97] disabled:opacity-40",
          listening
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_0_0_6px_var(--accent-soft)]"
            : "border-border bg-card text-muted-foreground hover:border-accent hover:text-accent"
        )}
      >
        {listening && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-[var(--accent)]"
            animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        {micSupported ? <Mic className="size-[18px]" /> : <MicOff className="size-[18px]" />}
      </button>

      <button
        title="Mute voice"
        onClick={onMuteClick}
        className={cn(
          "flex size-[42px] items-center justify-center rounded-full border transition-colors active:scale-[0.97]",
          muted
            ? "border-accent bg-[var(--accent-soft)] text-accent"
            : "border-border bg-card text-muted-foreground hover:border-accent hover:text-accent"
        )}
      >
        {muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
      </button>

      <button
        title="Wave-to-talk (webcam)"
        onClick={onGestureClick}
        className={cn(
          "flex size-[42px] items-center justify-center rounded-full border transition-colors active:scale-[0.97]",
          gestureOn
            ? "border-accent bg-[var(--accent-soft)] text-accent"
            : "border-border bg-card text-muted-foreground hover:border-accent hover:text-accent"
        )}
      >
        <Hand className="size-[18px]" />
      </button>

      <button
        title="Full team deep dive"
        onClick={onFullTeamClick}
        className={cn(
          "flex size-[42px] items-center justify-center rounded-full border transition-colors active:scale-[0.97]",
          fullTeamOn
            ? "border-accent bg-[var(--accent-soft)] text-accent"
            : "border-border bg-card text-muted-foreground hover:border-accent hover:text-accent"
        )}
      >
        <Users className="size-[18px]" />
      </button>

      <span className="max-w-[120px] min-w-[64px] truncate text-center text-[11px] text-muted-foreground">
        {statusText}
      </span>
    </div>
  );
}
