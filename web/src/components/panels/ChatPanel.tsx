import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  children: React.ReactNode;
  width: number;
  noWebgl: boolean;
  popout: boolean;
}

const ChatPanel = forwardRef<HTMLDivElement, ChatPanelProps>(function ChatPanel(
  { children, width, noWebgl, popout },
  ref
) {
  if (popout) {
    return (
      <main ref={ref} className="h-screen w-full overflow-y-auto bg-background px-4 pb-6 pt-[86px]">
        {children}
      </main>
    );
  }

  if (noWebgl) {
    return (
      <main
        ref={ref}
        className="mx-auto mt-[70px] w-full max-w-[640px] overflow-y-auto px-4 pb-8"
      >
        {children}
      </main>
    );
  }

  return (
    <main
      ref={ref}
      className={cn(
        "glass fixed top-[70px] bottom-24 right-4 z-10 flex flex-col overflow-y-auto rounded-[20px] px-4 py-5 shadow-lg",
        "max-w-[calc(100vw-32px)]",
        "max-md:left-3 max-md:right-3 max-md:top-auto max-md:bottom-24 max-md:h-[56vh] max-md:w-auto"
      )}
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
    >
      {children}
    </main>
  );
});

export default ChatPanel;
