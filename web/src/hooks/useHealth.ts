import { useEffect, useState } from "react";
import { checkHealth } from "@/lib/api";

/** Polls GET /health every 8s. */
export function useHealth() {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const ok = await checkHealth();
      if (!cancelled) setOnline(ok);
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return online;
}
