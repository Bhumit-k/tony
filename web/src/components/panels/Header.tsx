import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Moon, Settings, SquareArrowOutUpRight, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

interface HeaderProps {
  assistantName: string;
  onNameChange: (name: string) => void;
  online: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onPopout: () => void;
  showWorldChrome: boolean;
}

export default function Header({
  assistantName,
  onNameChange,
  online,
  theme,
  onToggleTheme,
  onOpenSettings,
  onPopout,
  showWorldChrome,
}: HeaderProps) {
  const nameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = nameRef.current;
    if (el && document.activeElement !== el && el.textContent !== assistantName) {
      el.textContent = assistantName;
    }
  }, [assistantName]);

  return (
    <header className="glass fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        {showWorldChrome && (
          <motion.div
            className="size-8 shrink-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 32% 28%, #fff, var(--accent) 60%, var(--primary) 100%)",
              boxShadow: "0 0 0 1px var(--border), var(--shadow-sm)",
            }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <div className="min-w-0">
          <div
            ref={nameRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            title="Click to rename"
            className="-mx-1 max-w-[44vw] truncate rounded-md px-1 text-[16px] font-bold tracking-tight outline-none hover:bg-[var(--accent-soft)] focus:bg-[var(--accent-soft)] focus:ring-2 focus:ring-[var(--accent-soft)] sm:max-w-[36vw]"
            onBlur={(e) => onNameChange(e.currentTarget.textContent || "")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLDivElement).blur();
              }
            }}
          >
            {assistantName}
          </div>
          <div className="text-[11.5px] tracking-wide text-muted-foreground">AI Assistant</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex size-[34px] items-center justify-center rounded-[10px] border border-border bg-card"
          title="Uplink status"
        >
          <span
            className={cn(
              "size-[7px] rounded-full",
              online ? "bg-[var(--success)] shadow-[0_0_6px_var(--success)]" : "bg-[var(--muted-foreground)]"
            )}
          />
        </div>
        {showWorldChrome && (
          <button
            className="flex size-[34px] items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:border-accent hover:text-accent active:scale-[0.97]"
            title="Pop out chat panel"
            onClick={onPopout}
          >
            <SquareArrowOutUpRight className="size-4" />
          </button>
        )}
        <button
          className="relative h-[30px] w-[52px] shrink-0 rounded-2xl border border-border bg-card"
          title="Toggle dark mode"
          onClick={onToggleTheme}
        >
          <motion.div
            className="absolute top-0.5 left-0.5 flex size-6 items-center justify-center rounded-full bg-[var(--accent)] text-[12px] text-[var(--accent-foreground)] shadow-sm"
            animate={{ x: theme === "dark" ? 22 : 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            {theme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
          </motion.div>
        </button>
        <button
          className="flex size-[34px] items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:border-accent hover:text-accent active:scale-[0.97]"
          title="Settings"
          onClick={onOpenSettings}
        >
          <Settings className="size-4" />
        </button>
      </div>
    </header>
  );
}
