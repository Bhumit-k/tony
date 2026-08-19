import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ShieldAlert } from "lucide-react";

import type { AgentRoomMessage } from "@/lib/types";
import { initials } from "@/lib/agents";
import LoadingState from "@/components/ui/loading-state";
import { cn } from "@/lib/utils";

function AgentExcerpt({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const short = text.length > 220 ? text.slice(0, 220) + "…" : text;
  return (
    <div
      className={cn(
        "mt-0.5 cursor-pointer text-[13.5px] leading-relaxed text-muted-foreground",
        !expanded && "line-clamp-2"
      )}
      onClick={() => setExpanded((v) => !v)}
    >
      {expanded ? text : short}
    </div>
  );
}

export default function AgentRoom({ msg }: { msg: AgentRoomMessage }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.div
      className="glass my-1 overflow-hidden rounded-[18px] shadow-md"
      initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <button
        className="flex w-full items-center justify-between gap-2 border-b border-border px-3.5 py-3 text-left"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="flex items-center gap-2 text-[13px] font-bold">
          {msg.status === "running" ? (
            <LoadingState label={msg.headline} variant="Orbit" />
          ) : (
            msg.headline
          )}
        </span>
        <motion.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
          className="text-muted-foreground"
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>

      <motion.div
        className="flex flex-col gap-2.5 overflow-hidden px-3.5"
        animate={{
          height: collapsed ? 0 : "auto",
          paddingTop: collapsed ? 0 : 10,
          paddingBottom: collapsed ? 0 : 14,
        }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <AnimatePresence initial={false}>
          {msg.rows.map((row, i) => (
            <motion.div
              key={row.codename}
              className="flex items-start gap-2.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, type: "spring", stiffness: 340, damping: 28 }}
            >
              <div
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                style={{ background: row.color }}
              >
                {initials(row.codename)}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[12.5px] font-bold">{row.codename}</span>
                <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                  {row.role}
                </span>
                {row.verdict && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--destructive)]">
                    <ShieldAlert className="size-3" />
                    {row.verdict}
                  </div>
                )}
                <AgentExcerpt text={row.output} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {msg.ceo && (
          <motion.div
            className="mt-0.5 flex items-start gap-2.5 border-t border-border pt-2.5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[13px] font-bold text-[var(--accent-foreground)]">
              {initials(msg.ceo.name)}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[13.5px] font-bold">{msg.ceo.name}</span>
              <span className="ml-1 text-[11px] font-medium text-muted-foreground">CEO</span>
              <div className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                {msg.ceo.output}
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
