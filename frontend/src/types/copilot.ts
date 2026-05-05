export interface CopilotTraceStep {
  text: string;
  done: boolean;
}

export interface CopilotCard {
  title: string;
  body: string;
  actions: string[];
}

export interface CopilotProposedAction {
  tool: string;
  args: Record<string, unknown>;
  /** null = simple confirm; otherwise the exact case-sensitive string the user must type. */
  confirm_token: string | null;
  consequence: string;
}

export interface CopilotMessage {
  id: string;
  from: "user" | "agent";
  name: string;
  time: string;
  text: string;
  trace?: CopilotTraceStep[];
  cards?: CopilotCard[];
  proposed_actions?: CopilotProposedAction[];
  /** Streaming flag — true while we're appending deltas, false once the stream ended. */
  streaming?: boolean;
  /** Per-action result after operator confirms / cancels. */
  action_results?: Record<string, "confirmed" | "cancelled" | "error">;
}

export interface CopilotContextResponse {
  greeting: string;
  chips: string[];
  initial_cards: CopilotCard[];
  account_count: number;
  sequence_count: number;
  agent_run_label: string;
}
