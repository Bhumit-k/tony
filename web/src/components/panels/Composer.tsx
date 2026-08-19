import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUp } from "lucide-react";

const SUGGESTIONS = [
  { q: "What's the weather in Dublin?", label: "Weather in Dublin" },
  { q: "Convert 100 USD to EUR", label: "Convert 100 USD to EUR" },
  { q: "Tell me a random fact", label: "Random fact" },
  {
    q: "Ask the team: should we launch a subscription meal-planning app?",
    label: "Ask the team a business question",
  },
];

interface ComposerProps {
  onSend: (text: string) => void;
  showSuggestions: boolean;
  fullTeamOn: boolean;
}

export default function Composer({ onSend, showSuggestions, fullTeamOn }: ComposerProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    setValue("");
    onSend(v);
  };

  return (
    <div>
      {showSuggestions && (
        <motion.div
          className="mb-1 mt-1.5 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              className="rounded-2xl border border-border bg-card px-3.5 py-2 text-[13px] text-muted-foreground transition-colors hover:border-accent hover:text-accent active:scale-[0.97]"
              onClick={() => onSend(s.q)}
            >
              {s.label}
            </button>
          ))}
        </motion.div>
      )}

      <div className="flex items-center gap-2 rounded-3xl border border-border bg-card py-1.5 pr-1.5 pl-4 shadow-sm">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message..."
          className="flex-1 bg-transparent py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] transition-opacity active:scale-[0.97] disabled:opacity-35"
          title="Send"
          disabled={!value.trim()}
          onClick={submit}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 text-center text-[11.5px] tracking-wide text-muted-foreground">
        Full team is{" "}
        <b className="text-foreground/80">{fullTeamOn ? "on" : "off"}</b>
        {fullTeamOn
          ? " — your next message runs all 11 specialist agents."
          : ' — say "ask the team" or tap the team button below for a multi-agent deep dive.'}
      </div>
    </div>
  );
}
