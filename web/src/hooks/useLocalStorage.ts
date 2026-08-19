import { useCallback, useState } from "react";

export function useLocalStorage(key: string, initial: string) {
  const [value, setValueState] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });

  const setValue = useCallback(
    (v: string) => {
      setValueState(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        // storage unavailable — in-memory only
      }
    },
    [key]
  );

  return [value, setValue] as const;
}
