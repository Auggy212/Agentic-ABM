export interface CopilotTraceStep {
  text: string;
  done: boolean;
}

export interface CopilotCard {
  title: string;
  body: string;
  actions: string[];
}

export interface CopilotMessage {
  id: string;
  from: "user" | "agent";
  name: string;
  time: string;
  text: string;
  trace?: CopilotTraceStep[];
  cards?: CopilotCard[];
}

export interface CopilotContextResponse {
  greeting: string;
  chips: string[];
  initial_cards: CopilotCard[];
  account_count: number;
  sequence_count: number;
  agent_run_label: string;
}
