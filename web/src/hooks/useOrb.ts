import { useCallback, useEffect, useRef, useState } from "react";
import type { OrbState, TonyWorldHandle } from "@/lib/worldApi";

/** Orb state + amplitude, forwarded into whichever world view (3D or the
 * flat fallback) is currently mounted. Amplitude continuously decays
 * (matching the original's always-running decay loop) so voice input/output
 * amplitude producers only need to push fresh values up. */
export function useOrb(worldRef: React.RefObject<TonyWorldHandle | null>) {
  const [orbState, setOrbStateInner] = useState<OrbState>("idle");
  const ampRef = useRef(0);
  const recoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbStateRef = useRef<OrbState>("idle");

  const setAmp = useCallback(
    (v: number) => {
      ampRef.current = Math.max(0, Math.min(1, v));
      worldRef.current?.setAmp(ampRef.current);
    },
    [worldRef]
  );

  const setOrbState = useCallback(
    (s: OrbState) => {
      orbStateRef.current = s;
      setOrbStateInner(s);
      worldRef.current?.setState(s);
      if (recoverTimer.current) clearTimeout(recoverTimer.current);
      if (s === "error") {
        recoverTimer.current = setTimeout(() => {
          if (orbStateRef.current === "error") setOrbState("idle");
        }, 5000);
      }
    },
    [worldRef]
  );

  useEffect(() => {
    let raf = 0;
    const decay = () => {
      setAmp(ampRef.current * 0.85);
      raf = requestAnimationFrame(decay);
    };
    raf = requestAnimationFrame(decay);
    return () => cancelAnimationFrame(raf);
  }, [setAmp]);

  return { orbState, orbStateRef, setOrbState, setAmp };
}
