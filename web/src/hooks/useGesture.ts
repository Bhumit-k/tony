import { useCallback, useEffect, useRef, useState } from "react";

const WAVE_COOLDOWN_MS = 2500;
const WAVE_WINDOW_MS = 1300;

/** Webcam frame-diff wave detection: grayscale luma diff between
 * consecutive frames, weighted-centroid tracking, and a reversal count to
 * distinguish an actual side-to-side wave from generic motion. Nothing is
 * recorded or uploaded — frames are read into a canvas and discarded. */
export function useGesture(videoEl: HTMLVideoElement | null, onWave: () => void) {
  const [active, setActive] = useState(false);
  const [waveFlash, setWaveFlash] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGrayRef = useRef<Uint8ClampedArray | null>(null);
  const centroidHistoryRef = useRef<Array<{ t: number; x: number }>>([]);
  const lastWaveRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(false);
  const onWaveRef = useRef(onWave);
  onWaveRef.current = onWave;

  if (!canvasRef.current && typeof document !== "undefined") {
    canvasRef.current = document.createElement("canvas");
    canvasRef.current.width = 48;
    canvasRef.current.height = 36;
  }

  const checkWave = useCallback((now: number) => {
    const hist = centroidHistoryRef.current;
    if (now - lastWaveRef.current < WAVE_COOLDOWN_MS || hist.length < 5) return;
    const xs = hist.map((p) => p.x);
    if (Math.max(...xs) - Math.min(...xs) < 0.16) return;
    let reversals = 0;
    for (let i = 2; i < xs.length; i++) {
      const d1 = xs[i - 1] - xs[i - 2];
      const d2 = xs[i] - xs[i - 1];
      if (Math.abs(d1) > 0.01 && Math.abs(d2) > 0.01 && d1 > 0 !== d2 > 0) reversals++;
    }
    if (reversals >= 2) {
      lastWaveRef.current = now;
      centroidHistoryRef.current = [];
      setWaveFlash(true);
      setTimeout(() => setWaveFlash(false), 500);
      onWaveRef.current();
    }
  }, []);

  const sample = useCallback(() => {
    if (!activeRef.current || !videoEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width,
      h = canvas.height;
    try {
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, w, h);
        const frame = ctx.getImageData(0, 0, w, h).data;
        const gray = new Uint8ClampedArray(w * h);
        for (let i = 0, p = 0; i < frame.length; i += 4, p++) {
          gray[p] = (frame[i] * 0.3 + frame[i + 1] * 0.59 + frame[i + 2] * 0.11) | 0;
        }
        const prevGray = prevGrayRef.current;
        if (prevGray) {
          let sumDiff = 0,
            sumWeightedX = 0;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = y * w + x;
              const d = Math.abs(gray[idx] - prevGray[idx]);
              if (d > 25) {
                sumDiff += d;
                sumWeightedX += d * x;
              }
            }
          }
          const now = performance.now();
          if (sumDiff > 4000) {
            centroidHistoryRef.current.push({ t: now, x: sumWeightedX / sumDiff / w });
          }
          centroidHistoryRef.current = centroidHistoryRef.current.filter(
            (p) => now - p.t < WAVE_WINDOW_MS
          );
          checkWave(now);
        }
        prevGrayRef.current = gray;
      }
    } catch {
      // frame read failed transiently — keep sampling
    }
    timerRef.current = setTimeout(sample, 80);
  }, [videoEl, checkWave]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoEl) videoEl.srcObject = stream;
      prevGrayRef.current = null;
      centroidHistoryRef.current = [];
      activeRef.current = true;
      setActive(true);
      sample();
    } catch (e) {
      console.warn("[Tony] Camera unavailable:", e instanceof Error ? e.message : e);
      activeRef.current = false;
      setActive(false);
    }
  }, [videoEl, sample]);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    activeRef.current = false;
    setActive(false);
    prevGrayRef.current = null;
    centroidHistoryRef.current = [];
  }, []);

  useEffect(() => stop, [stop]);

  return { active, waveFlash, start, stop };
}
