import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Btn from "@/components/ui/Btn";
import PhaseLockBanner from "@/pages/Checkpoint2/PhaseLockBanner";
import CP3PhaseLockBanner from "@/pages/Checkpoint3/PhaseLockBanner";

type AgentStatus = "NOT_STARTED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED_ON_CHECKPOINT";

interface AgentRun {
  status: AgentStatus;
  last_run?: string;
  progress?: { processed: number; total: number };
  last_error?: string;
  cost_so_far?: { claude: number; gpt: number; total: number };
  warning?: string;
}

interface PipelineStatus {
  client_id: string;
  cp3_status?: "OPERATOR_REVIEW" | "CLIENT_REVIEW" | "CHANGES_REQUESTED" | "APPROVED";
  agents: Record<string, AgentRun>;
  recent_runs: {
    agent: string;
    started: string;
    finished?: string;
    status: AgentStatus;
    records_processed: number;
    warnings_count: number;
    warnings?: string[];
    estimated_cost?: number;
  }[];
}

interface QuotaStatus {
  APOLLO_CONTACTS: { used: number; limit: number };
  HUNTER: { used: number; limit: number };
  LUSHA: { used: number; limit: number };
  NEVERBOUNCE?: { used: number; limit: number };
  ZEROBOUNCE?: { used: number; limit: number };
  PERPLEXITY?: { used: number; limit: number };
  ANTHROPIC_CLAUDE?: { used: number; limit: number };
  OPENAI_GPT_4O_MINI?: { used: number; limit: number };
}

const AGENTS = [
  { name: "Intake", key: "intake", phase: 1 },
  { name: "ICP Scout", key: "icp_scout", phase: 1, endpoint: "/api/accounts/discover" },
  { name: "Buyer Intel", key: "buyer_intel", phase: 2, endpoint: "/api/buyers/discover" },
  { name: "Signal & Intel", key: "signal_intel", phase: 2, endpoint: "/api/signals/discover" },
  { name: "Verifier", key: "verifier", phase: 3 },
  { name: "Storyteller", key: "storyteller", phase: 4, endpoint: "/api/storyteller/generate" },
  { name: "Campaign", key: "campaign", phase: 5 },
];

const STATUS: Record<AgentStatus, { label: string; color: string; bg: string }> = {
  NOT_STARTED: { label: "Not started", color: "var(--text-3)", bg: "var(--surface-2)" },
  RUNNING: { label: "Running", color: "#1d4ed8", bg: "#eff6ff" },
  COMPLETED: { label: "Completed", color: "var(--good-700)", bg: "var(--good-50)" },
  FAILED: { label: "Failed", color: "var(--bad-700)", bg: "var(--bad-50)" },
  BLOCKED_ON_CHECKPOINT: { label: "Checkpoint", color: "var(--warn-700)", bg: "var(--warn-50)" },
};

function usePipelineStatus(clientId: string) {
  return useQuery({
    queryKey: ["pipeline-status", clientId],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await api.get<PipelineStatus>("/api/pipeline/status", { params: { client_id: clientId } });
      return data;
    },
  });
}

function useQuotaStatus() {
  return useQuery({
    queryKey: ["quota-status"],
    queryFn: async () => {
      const { data } = await api.get<QuotaStatus>("/api/quota/status");
      return data;
    },
    retry: false,
  });
}

function useTriggerAgent(endpoint?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      if (!endpoint) return null;
      const { data } = await api.post(endpoint, { client_id: clientId });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });
}

function QuotaBar({ label, used, limit, money }: { label: string; used: number; limit: number; money?: boolean }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct >= 90 ? "var(--bad-500)" : pct >= 70 ? "var(--warn-500)" : "var(--good-500)";
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
          {money ? `$${used.toFixed(2)} / $${limit.toFixed(0)}` : `${used}/${limit}`}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color }} />
      </div>
      <div style={{ color: pct >= 90 ? "var(--bad-700)" : "var(--text-3)", fontSize: 10 }}>{Math.round(pct)}% used</div>
    </div>
  );
}

function QuotaPanel({ quota }: { quota?: QuotaStatus }) {
  if (!quota) return <div className="card card-pad"><div className="section-eyebrow">Quota status</div></div>;
  return (
    <div className="card card-pad" style={{ display: "grid", gap: 14, borderRadius: 8 }}>
      <div className="section-eyebrow">Quota status</div>
      <QuotaBar label="Apollo contacts" used={quota.APOLLO_CONTACTS.used} limit={quota.APOLLO_CONTACTS.limit} />
      <QuotaBar label="Hunter verifications" used={quota.HUNTER.used} limit={quota.HUNTER.limit} />
      <QuotaBar label="Lusha enrichments" used={quota.LUSHA.used} limit={quota.LUSHA.limit} />
      {quota.NEVERBOUNCE && <QuotaBar label="NeverBounce monthly" used={quota.NEVERBOUNCE.used} limit={quota.NEVERBOUNCE.limit} />}
      {quota.ZEROBOUNCE && <QuotaBar label="ZeroBounce monthly" used={quota.ZEROBOUNCE.used} limit={quota.ZEROBOUNCE.limit} />}
      {quota.ANTHROPIC_CLAUDE && <QuotaBar label="Anthropic Claude" used={quota.ANTHROPIC_CLAUDE.used} limit={quota.ANTHROPIC_CLAUDE.limit} money />}
      {quota.OPENAI_GPT_4O_MINI && <QuotaBar label="OpenAI GPT-4o-mini" used={quota.OPENAI_GPT_4O_MINI.used} limit={quota.OPENAI_GPT_4O_MINI.limit} money />}
    </div>
  );
}

function CheckpointStatusBar({ status = "OPERATOR_REVIEW", clientId }: { status?: string; clientId: string }) {
  const copy =
    status === "CLIENT_REVIEW"
      ? "CP3 awaiting client review"
      : status === "CHANGES_REQUESTED"
        ? "CP3 client requested changes"
        : status === "APPROVED"
          ? "CP3 approved by client"
          : "CP3 operator review in progress (138/274 messages)";
  return (
    <div className="banner" data-tone={status === "APPROVED" ? "good" : "warn"} style={{ borderRadius: 8 }}>
      <div className="banner-body">
        <div className="banner-title">CP1 approved · CP2 approved</div>
        <div className="banner-text">{copy}</div>
      </div>
      <Link className="btn" data-variant="primary" to={`/checkpoint-3?client_id=${clientId}`}>Open CP3</Link>
    </div>
  );
}

function AgentStatusCard({ agent, run, clientId }: { agent: (typeof AGENTS)[number]; run?: AgentRun; clientId: string }) {
  const status = run?.status ?? "NOT_STARTED";
  const cfg = STATUS[status];
  const trigger = useTriggerAgent(agent.endpoint);
  const future = agent.phase > 4;
  return (
    <div className="card card-pad" style={{ borderRadius: 8, opacity: future ? 0.55 : 1, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <strong>{agent.name}</strong>
        <span style={{ borderRadius: 999, background: cfg.bg, color: cfg.color, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{future ? `Phase ${agent.phase}` : cfg.label}</span>
      </div>
      {run?.progress && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)" }}>
            <span>Progress</span><span>{run.progress.processed} / {run.progress.total}</span>
          </div>
          <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(run.progress.processed / run.progress.total) * 100}%`, background: "var(--acc-600)" }} />
          </div>
        </div>
      )}
      {run?.cost_so_far && <div style={{ fontSize: 12, color: "var(--text-2)" }}>Claude: ${run.cost_so_far.claude.toFixed(2)} · GPT: ${run.cost_so_far.gpt.toFixed(2)} · Total: ${run.cost_so_far.total.toFixed(2)}</div>}
      {run?.warning && <div style={{ color: "var(--warn-700)", fontSize: 12 }}>{run.warning}</div>}
      {agent.endpoint && !future && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn size="sm" variant={status === "COMPLETED" ? "ghost" : "accent"} loading={trigger.isPending} onClick={() => trigger.mutate(clientId)}>
            {status === "COMPLETED" ? "Re-run" : "Run"}
          </Btn>
          {agent.key === "storyteller" && <Link className="btn btn-sm" to={`/storyteller?client_id=${clientId}`}>View Output</Link>}
        </div>
      )}
    </div>
  );
}

function RecentRunsLog({ runs }: { runs: PipelineStatus["recent_runs"] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="card card-pad" style={{ borderRadius: 8 }}>
      <div className="section-eyebrow" style={{ marginBottom: 12 }}>Recent runs</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-3)" }}>
            <th style={{ padding: 8 }}>Agent</th><th style={{ padding: 8 }}>Started</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Records</th><th style={{ padding: 8 }}>Warnings</th><th style={{ padding: 8 }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => (
            <>
              <tr key={`${run.agent}-${run.started}`} style={{ borderTop: "1px solid var(--border)", cursor: run.warnings_count ? "pointer" : "default" }} onClick={() => run.warnings_count && setExpanded(expanded === index ? null : index)}>
                <td style={{ padding: 8, fontWeight: 700 }}>{run.agent}</td>
                <td style={{ padding: 8, color: "var(--text-2)" }}>{new Date(run.started).toLocaleString()}</td>
                <td style={{ padding: 8 }}>{run.status}</td>
                <td style={{ padding: 8, fontFamily: "var(--font-mono)" }}>{run.records_processed}</td>
                <td style={{ padding: 8, color: run.warnings_count ? "var(--warn-700)" : "var(--text-3)" }}>{run.warnings_count || "-"}</td>
                <td style={{ padding: 8, fontFamily: "var(--font-mono)" }}>{run.estimated_cost ? `$${run.estimated_cost.toFixed(2)}` : "-"}</td>
              </tr>
              {expanded === index && run.warnings && (
                <tr><td colSpan={6} style={{ padding: 10, background: "var(--warn-50)", color: "var(--warn-700)" }}>{run.warnings.join(" · ")}</td></tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PipelinePage() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id") || "12345678-1234-5678-1234-567812345678";
  const { data: pipeline } = usePipelineStatus(clientId);
  const { data: quota } = useQuotaStatus();
  const runs = pipeline?.recent_runs ?? [];
  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>Pipeline</h1>
        <div className="page-head-meta">client {clientId.slice(0, 8)}</div>
      </div>
      <div className="page-body" style={{ display: "grid", gap: 18 }}>
        <PhaseLockBanner clientId={clientId} />
        <CP3PhaseLockBanner clientId={clientId} approved={pipeline?.cp3_status === "APPROVED"} />
        <CheckpointStatusBar clientId={clientId} status={pipeline?.cp3_status} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {AGENTS.map((agent) => <AgentStatusCard key={agent.key} agent={agent} run={pipeline?.agents[agent.key]} clientId={clientId} />)}
          </div>
          <QuotaPanel quota={quota} />
        </div>
        <RecentRunsLog runs={runs} />
      </div>
    </>
  );
}
