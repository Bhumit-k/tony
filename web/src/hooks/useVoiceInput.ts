import { useCallback, useEffect, useRef, useState } from "react";

// Minimal ambient typings for the (non-standardized) Web Speech API.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed":
    "microphone access blocked — allow it in your browser's site settings, then retry",
  "service-not-allowed":
    "microphone access blocked — allow it in your browser's site settings, then retry",
  "audio-capture": "no microphone found — check it's connected and not in use elsewhere",
  network: "voice recognition needs an internet connection (it calls your browser's speech service)",
};

export interface UseVoiceInputOptions {
  onFinalResult: (text: string) => void;
  onListeningStart: () => void;
  onListeningEnd: () => void;
  onError: (message: string) => void;
  onAmp: (v: number) => void;
  voiceLoopOn: boolean;
  beforeStart?: () => void;
}

export function useVoiceInput({
  onFinalResult,
  onListeningStart,
  onListeningEnd,
  onError,
  onAmp,
  voiceLoopOn,
  beforeStart,
}: UseVoiceInputOptions) {
  const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
  const supported = !!SR;
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognizingRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceLoopRef = useRef(voiceLoopOn);
  voiceLoopRef.current = voiceLoopOn;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const ampRafRef = useRef(0);

  const stopMicVisualizer = useCallback(() => {
    if (ampRafRef.current) cancelAnimationFrame(ampRafRef.current);
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    micStreamRef.current = null;
    audioCtxRef.current = null;
  }, []);

  const startMicVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const d = (data[i] - 128) / 128;
          sum += d * d;
        }
        onAmp(Math.sqrt(sum / data.length) * 4.2);
        ampRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn(
        "[Tony] Mic visualizer unavailable (amplitude ring won't react, but recognition can still work):",
        e instanceof Error ? e.message : e
      );
    }
  }, [onAmp]);

  const initRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (!SR) return null;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onstart = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      recognizingRef.current = true;
      setListening(true);
      onListeningStart();
      startMicVisualizer();
    };
    r.onresult = (e) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
      }
      if (final.trim()) onFinalResult(final.trim());
    };
    r.onerror = (e) => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      console.warn("[Tony] Speech recognition error:", e.error);
      if (e.error === "no-speech" || e.error === "aborted") return;
      onError(ERROR_MESSAGES[e.error] || `voice error (${e.error}) — tap the mic to retry`);
    };
    r.onend = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      recognizingRef.current = false;
      setListening(false);
      stopMicVisualizer();
      onAmp(0);
      onListeningEnd();
    };
    return r;
  }, [SR, onFinalResult, onError, onListeningStart, onListeningEnd, onAmp, startMicVisualizer, stopMicVisualizer]);

  const start = useCallback(() => {
    if (!SR) return;
    if (recognizingRef.current) return;
    beforeStart?.();
    if (!recognitionRef.current) recognitionRef.current = initRecognition();
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.start();
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        if (!recognizingRef.current) {
          console.warn(
            "[Tony] Speech recognition never started — likely blocked network access to the browser's speech service."
          );
          onError("voice recognition isn't responding — your network may be blocking it, or try Chrome/Edge");
        }
      }, 4000);
    } catch (e) {
      console.warn("[Tony] recognition.start() threw:", e instanceof Error ? e.message : e);
      onError(`couldn't start listening (${e instanceof Error ? e.message : "unknown error"})`);
    }
  }, [SR, beforeStart, initRecognition, onError]);

  const stop = useCallback(() => {
    if (recognitionRef.current && recognizingRef.current) recognitionRef.current.stop();
  }, []);

  useEffect(() => stopMicVisualizer, [stopMicVisualizer]);

  return { supported, listening, start, stop, recognizingRef };
}
