export type AgentStatus = "NOT_STARTED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED_ON_CHECKPOINT";

export interface PipelineStatus {
  client_id: string;
  agents: Record<string, {
    status: AgentStatus;
    last_run?: string;
    progress?: { processed: number; total: number };
    last_error?: string;
  }>;
  recent_runs: {
    agent: string;
    started: string;
    finished?: string;
    status: AgentStatus;
    records_processed: number;
    warnings_count: number;
    warnings?: string[];
  }[];
}

export const MOCK_PIPELINE_STATUS: PipelineStatus = {
  client_id: "12345678-1234-5678-1234-567812345678",
  agents: {
    intake: {
      status: "COMPLETED",
      last_run: new Date("2026-04-15T09:00:00Z").toISOString(),
    },
    icp_scout: {
      status: "COMPLETED",
      last_run: new Date("2026-04-16T10:30:00Z").toISOString(),
      progress: { processed: 150, total: 150 },
    },
    buyer_intel: {
      status: "COMPLETED",
      last_run: new Date("2026-04-18T14:00:00Z").toISOString(),
      progress: { processed: 48, total: 50 },
    },
    signal_intel: {
      status: "COMPLETED",
      last_run: new Date("2026-04-20T11:00:00Z").toISOString(),
      progress: { processed: 150, total: 150 },
    },
    verifier: { status: "NOT_STARTED" },
    storyteller: { status: "NOT_STARTED" },
    campaign: { status: "NOT_STARTED" },
  },
  recent_runs: [
    {
      agent: "Signal & Intel",
      started: new Date("2026-04-20T11:00:00Z").toISOString(),
      finished: new Date("2026-04-20T11:45:00Z").toISOString(),
      status: "COMPLETED",
      records_processed: 150,
      warnings_count: 1,
      warnings: ["Apollo quota 48/50 — 2 accounts marked PENDING_QUOTA_RESET"],
    },
    {
      agent: "Buyer Intel",
      started: new Date("2026-04-18T14:00:00Z").toISOString(),
      finished: new Date("2026-04-18T14:32:00Z").toISOString(),
      status: "COMPLETED",
      records_processed: 240,
      warnings_count: 0,
    },
    {
      agent: "ICP Scout",
      started: new Date("2026-04-16T10:30:00Z").toISOString(),
      finished: new Date("2026-04-16T10:58:00Z").toISOString(),
      status: "COMPLETED",
      records_processed: 150,
      warnings_count: 0,
    },
    {
      agent: "Intake",
      started: new Date("2026-04-15T09:00:00Z").toISOString(),
      finished: new Date("2026-04-15T09:04:00Z").toISOString(),
      status: "COMPLETED",
      records_processed: 1,
      warnings_count: 0,
    },
  ],
};

export function getMockPipelineStatus(clientId: string): PipelineStatus | null {
  if (!clientId) return null;
  return { ...MOCK_PIPELINE_STATUS, client_id: clientId };
}
