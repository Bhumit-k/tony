import { AnimatePresence, motion } from "motion/react";

import type { ChatMessage } from "@/lib/types";
import AgentRoom from "@/components/panels/AgentRoom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TranscriptProps {
  messages: ChatMessage[];
  onConfirmAction: (id: string) => void;
  onCancelAction: (id: string) => void;
}

export default function Transcript({ messages, onConfirmAction, onCancelAction }: TranscriptProps) {
  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {messages.map((msg) => {
          if (msg.kind === "bubble") {
            return (
              <motion.div
                key={msg.id}
                className={cn("flex", msg.who === "you" ? "justify-end" : "justify-start")}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div
                  className={cn(
                    "max-w-[78%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm",
                    msg.who === "you"
                      ? "rounded-br-md bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "rounded-bl-md border border-border bg-card"
                  )}
                >
                  {msg.text}
                </div>
              </motion.div>
            );
          }
          if (msg.kind === "confirm") {
            return (
              <motion.div
                key={msg.id}
                className="flex justify-start"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl border px-3.5 py-3 shadow-sm transition-opacity",
                    "border-[var(--warn)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)]",
                    msg.status !== "pending" && "pointer-events-none opacity-60"
                  )}
                >
                  <div className="mb-2.5 text-[13.5px]">
                    {msg.status === "pending" && `Go ahead and ${msg.action.label}?`}
                    {msg.status === "cancelled" && "Cancelled."}
                    {msg.status === "confirmed" && `Running: ${msg.action.label}…`}
                  </div>
                  {msg.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 rounded-lg"
                        onClick={() => onConfirmAction(msg.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-lg"
                        onClick={() => onCancelAction(msg.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          }
          return <AgentRoom key={msg.id} msg={msg} />;
        })}
      </AnimatePresence>
    </div>
  );
}
