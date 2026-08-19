import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceOption {
  name: string;
  label: string;
}

/** speechSynthesis wrapper: voice picker options, rate, mute, and a speak()
 * promise that resolves when playback ends (or immediately if muted/
 * unsupported), driving amplitude jitter for the orb while speaking. */
export function useVoiceOutput(onAmp: (v: number) => void, onSpeakStart: () => void) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [rate, setRate] = useState(1.0);
  const [muted, setMuted] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!synth) return;
    const load = () => {
      const all = synth.getVoices();
      if (!all.length) return;
      voicesRef.current = all;
      const english = all.filter((v) => v.lang.startsWith("en"));
      const pool = english.length ? english : all;
      setVoices(pool.map((v) => ({ name: v.name, label: v.name.replace(/^Google |^Microsoft /, "") })));
      setVoiceName((prev) => prev || pool[0]?.name || "");
    };
    load();
    synth.onvoiceschanged = load;
    return () => {
      synth.onvoiceschanged = null;
    };
  }, [synth]);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!synth || muted || !text) {
          resolve();
          return;
        }
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const chosen = voicesRef.current.find((v) => v.name === voiceName);
        if (chosen) u.voice = chosen;
        u.rate = rate;
        onSpeakStart();
        u.onboundary = () => onAmp(0.45 + Math.random() * 0.45);
        u.onend = () => {
          onAmp(0);
          resolve();
        };
        u.onerror = () => {
          onAmp(0);
          resolve();
        };
        synth.speak(u);
      }),
    [synth, muted, voiceName, rate, onAmp, onSpeakStart]
  );

  const cancel = useCallback(() => synth?.cancel(), [synth]);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next) synth?.cancel();
      return next;
    });
  }, [synth]);

  return { voices, voiceName, setVoiceName, rate, setRate, muted, toggleMuted, speak, cancel, supported: !!synth };
}
