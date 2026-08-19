import { useEffect, useRef, useState } from "react";

const MIN_WIDTH = 300;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 400;

/** Drag-to-resize the chat panel from its left edge, persisted width. */
export function useResizablePanel() {
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem("tony-panel-width"));
    return saved ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, saved)) : DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const w = window.innerWidth - e.clientX - 16;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setWidth((w) => {
        localStorage.setItem("tony-panel-width", String(w));
        return w;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    draggingRef.current = true;
    e.preventDefault();
  };

  return { width, startDrag };
}
