import { useEffect, useRef } from "react";

export interface BubbleSyncMessage {
  type: "bubble";
  who: "you" | "tony";
  text: string;
}

/** Keeps the main window and a popped-out chat window (see `?popout=1`)
 * in sync via BroadcastChannel. */
export function useBroadcastSync(onMessage: (msg: BubbleSyncMessage) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("tony-chat-sync");
      channelRef.current = channel;
      channel.onmessage = (e: MessageEvent<BubbleSyncMessage>) => {
        if (e.data?.type === "bubble") onMessageRef.current(e.data);
      };
    } catch {
      // BroadcastChannel unsupported — chat still works locally
    }
    return () => channel?.close();
  }, []);

  const broadcastBubble = (who: "you" | "tony", text: string) => {
    channelRef.current?.postMessage({ type: "bubble", who, text } satisfies BubbleSyncMessage);
  };

  return { broadcastBubble };
}
