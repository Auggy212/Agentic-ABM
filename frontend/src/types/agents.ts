export type AgentStatus = "running" | "idle" | "error";
export type EventTone = "found" | "warn" | "block" | "run";

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  description: string;
  runs: string;
  icon: string;
}

export interface AgentEvent {
  id: string;
  time: string;
  tone: EventTone;
  agent: string;
  title: string;
  meta: string;
  stat: string;
}

export interface AgentsResponse {
  agents: Agent[];
  events: AgentEvent[];
}
