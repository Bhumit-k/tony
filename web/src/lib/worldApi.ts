export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

// The imperative surface the rest of the app drives the 3D world (or its
// flat-orb fallback) through — kept identical in shape to the original
// vanilla implementation's `window.TonyWorld`.
export interface TonyWorldHandle {
  setState(state: OrbState): void;
  setAmp(amp: number): void;
  pulseCompanion(name: string): void;
  broadcastPulse(): void;
  flashAlert(name: string): void;
  pulseFinal(): void;
  setName(name: string): void;
}
