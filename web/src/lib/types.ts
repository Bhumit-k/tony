import type { PendingAction, StreamEvent } from "@/lib/api";

export interface BubbleMessage {
  kind: "bubble";
  id: string;
  who: "you" | "tony";
  text: string;
}

export interface ConfirmMessage {
  kind: "confirm";
  id: string;
  action: PendingAction;
  status: "pending" | "confirmed" | "cancelled";
}

export interface AgentRowData {
  codename: string;
  role: string;
  color: string;
  output: string;
  verdict?: string;
}

export interface AgentRoomMessage {
  kind: "agent-room";
  id: string;
  assistantName: string;
  status: "running" | "done";
  headline: string;
  rows: AgentRowData[];
  ceo?: { name: string; output: string };
}

export type ChatMessage = BubbleMessage | ConfirmMessage | AgentRoomMessage;

export type { StreamEvent };
