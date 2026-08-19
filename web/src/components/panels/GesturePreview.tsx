import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface GesturePreviewProps {
  active: boolean;
  waveDetected: boolean;
}

const GesturePreview = forwardRef<HTMLVideoElement, GesturePreviewProps>(function GesturePreview(
  { active, waveDetected },
  ref
) {
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className={cn(
        "fixed bottom-20 left-4 z-[15] h-[72px] w-24 -scale-x-100 rounded-xl border border-border bg-black object-cover shadow-md transition-opacity duration-300",
        active ? "opacity-100" : "pointer-events-none opacity-0",
        waveDetected && "ring-[3px] ring-[var(--accent)]"
      )}
    />
  );
});

export default GesturePreview;
