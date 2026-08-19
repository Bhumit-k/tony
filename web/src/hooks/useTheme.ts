import { useCallback, useEffect } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";

/** Light/dark theme, persisted, default light. Toggles the `.dark` class on
 * <html> which drives every CSS-variable-based token in index.css. */
export function useTheme() {
  const [theme, setTheme] = useLocalStorage("tony-theme", "light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme: theme as "light" | "dark", setTheme, toggleTheme };
}
