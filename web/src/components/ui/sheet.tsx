import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * A bottom-anchored sheet with a real spring transition (enter + exit),
 * backdrop dim, Escape-to-close and click-outside-to-close. Built directly
 * on motion + a portal rather than Radix Dialog so AnimatePresence can
 * drive the exit animation cleanly.
 */
function Sheet({ open, onOpenChange, children }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <React.Fragment>
          <motion.div
            key="sheet-backdrop"
            className="fixed inset-0 z-[80] bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            key="sheet-content"
            role="dialog"
            aria-modal="true"
            className={cn(
              "fixed inset-x-0 bottom-0 z-[81] mx-auto max-h-[85vh] w-full max-w-[480px]",
              "overflow-y-auto rounded-t-3xl border border-b-0 border-border bg-popover shadow-lg",
              "px-5 pb-8 pt-2.5"
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
          >
            <div className="mx-auto mb-3.5 mt-2 h-1 w-9 rounded-full bg-[var(--border-strong)]" />
            {children}
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>,
    document.body
  );
}

function SheetSection({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mt-4 first:mt-1", className)}>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function SheetRow({
  label,
  description,
  children,
  className,
}: {
  label: React.ReactNode;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0",
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-[14.5px]">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export { Sheet, SheetSection, SheetRow };
