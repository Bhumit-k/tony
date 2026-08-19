import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { motion } from "motion/react";

import type { OrbState, TonyWorldHandle } from "@/lib/worldApi";
import { cn } from "@/lib/utils";

interface OrbFallbackProps {
  assistantName: string;
}

/**
 * Flat CSS-animated 2D orb, used when WebGL is unavailable. Implements the
 * same imperative surface as the 3D world so the rest of the app doesn't
 * need to know which one is mounted.
 */
const OrbFallback = forwardRef<TonyWorldHandle, OrbFallbackProps>(function OrbFallback(
  { assistantName },
  ref
) {
  const [state, setStateInner] = useState<OrbState>("idle");
  const [amp, setAmpInner] = useState(0);
  const [name, setNameInner] = useState(assistantName);
  const orbRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    setState: setStateInner,
    setAmp: setAmpInner,
    pulseCompanion: () => {},
    broadcastPulse: () => {},
    flashAlert: () => {},
    pulseFinal: () => {},
    setName: setNameInner,
  }));

  useEffect(() => {
    setNameInner(assistantName);
  }, [assistantName]);

  const labels: Record<OrbState, string> = {
    idle: "tap the mic, or type below",
    listening: "listening…",
    thinking: `${name} is thinking…`,
    speaking: `${name} is speaking…`,
    error: "something went wrong — tap the mic to retry",
  };

  return (
    <div className="flex flex-col items-center gap-3.5 pb-8 pt-5">
      <div className="relative size-[132px]" data-state={state}>
        <motion.div
          ref={orbRef}
          className={cn(
            "size-full rounded-full shadow-md",
            state === "idle" && "animate-[breathe_4.2s_cubic-bezier(.45,0,.55,1)_infinite]",
            state === "thinking" && "animate-[breathe_1.1s_cubic-bezier(.45,0,.55,1)_infinite]",
            state === "speaking" && "animate-[breathe_0.55s_cubic-bezier(.45,0,.55,1)_infinite]"
          )}
          style={{
            background:
              state === "error"
                ? "radial-gradient(circle at 32% 26%, #fff 0%, var(--destructive) 75%, var(--destructive) 100%)"
                : "radial-gradient(circle at 32% 26%, #ffffff 0%, var(--accent) 55%, var(--primary) 100%)",
            boxShadow: "0 0 0 1px var(--border), var(--shadow-md)",
            opacity: state === "error" ? 0.85 : 1,
          }}
          animate={
            state === "listening" || state === "speaking"
              ? { scale: 1 + amp * 0.12 }
              : { scale: 1 }
          }
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        />
        {state === "listening" && (
          <motion.div
            className="pointer-events-none absolute -inset-3.5 rounded-full border-[1.5px]"
            style={{ borderColor: "var(--accent)" }}
            initial={{ scale: 0.9, opacity: 0.55 }}
            animate={{ scale: 1.35, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </div>
      <div className="h-[18px] text-[13px] tracking-[0.01em] text-muted-foreground">
        {labels[state]}
      </div>
    </div>
  );
});

export default OrbFallback;
