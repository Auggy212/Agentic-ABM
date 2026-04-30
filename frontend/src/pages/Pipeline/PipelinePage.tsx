import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Btn from "@/components/ui/Btn";
import PhaseLockBanner from "@/pages/Checkpoint2/PhaseLockBanner";

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentStatus = "NOT_STARTED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED_ON_CHECKPOINT";

interface AgentCard {
  name: string;
  key: string;
  icon: string;
  phase: number;
  discoverEndpoint?: string;
}

interface AgentRun {
  status: AgentStatus;
  last_run?: string;
  progress?: { processed: number; total: number };
  last_error?: string;
}

interface PipelineStatus {
  client_id: string;
  agents: Record<string, AgentRun>;
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

interface QuotaStatus {
  APOLLO_CONTACTS: { used: number; limit: number };
  HUNTER: { used: number; limit: number };
  LUSHA: { used: number; limit: number };
  NEVERBOUNCE?: { used: number; limit: number };
  ZEROBOUNCE?: { used: number; limit: number };
  PERPLEXITY?: { used: number; limit: number };
  CLAUDE_TOKENS?: { used: number; limit: number };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function usePipelineStatus(clientId: string | null) {
  return useQuery({
    queryKey: ["pipeline-status", clientId],
    enabled: Boolean(clientId),
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await api.get<PipelineStatus>("/api/pipeline/status", {
        params: { client_id: clientId },
      });
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

function useTriggerAgent(endpoint: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data } = await api.post(endpoint, { client_id: clientId });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });
}

// ── Checkpoint status bar ─────────────────────────────────────────────────────

function CheckpointStatusBar() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 20px",
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 8,
        fontSize: 13,
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: "#15803d", fontWeight: 600 }}>✓ CP1 approved</span>
      <span style={{ color: "var(--text-3)" }}>·</span>
      <span style={{ color: "#b45309", fontWeight: 500 }}>⏳ CP2 pending (after Verifier completes)</span>
      <span style={{ color: "var(--text-3)" }}>·</span>
      <span style={{ color: "var(--text-3)", fontSize: 12 }}>
        CP2 checklist: backend/docs/cp2_review_checklist.md
      </span>
    </div>
  );
}

// ── Quota panel ───────────────────────────────────────────────────────────────

function QuotaBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct >= 90 ? "#b91c1c" : pct >= 70 ? "#b45309" : "#15803d";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span style={{ fontWeight: 500, color: "var(--text-1)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: 11 }}>
          {used}/{limit}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--surface-2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 3,
            transition: "width 0.4s",
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: pct >= 90 ? "#b91c1c" : "var(--text-3)", fontWeight: pct >= 90 ? 700 : 400 }}>
        {Math.round(pct)}% used{pct >= 90 ? " - near limit" : ""}
      </div>
    </div>
  );
}

function QuotaPanel({ quota }: { quota: QuotaStatus | undefined }) {
  if (!quota) {
    return (
      <div className="card card-pad">
        <div className="section-eyebrow">Quota status</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="section-eyebrow">Quota status</div>
      <QuotaBar label="Apollo contacts" used={quota.APOLLO_CONTACTS.used} limit={quota.APOLLO_CONTACTS.limit} />
      {quota.NEVERBOUNCE && (
        <QuotaBar label="NeverBounce monthly" used={quota.NEVERBOUNCE.used} limit={quota.NEVERBOUNCE.limit} />
      )}
      {quota.ZEROBOUNCE && (
        <QuotaBar label="ZeroBounce monthly" used={quota.ZEROBOUNCE.used} limit={quota.ZEROBOUNCE.limit} />
      )}
      <QuotaBar label="Hunter verifications" used={quota.HUNTER.used} limit={quota.HUNTER.limit} />
      <QuotaBar label="Lusha enrichments" used={quota.LUSHA.used} limit={quota.LUSHA.limit} />
      {quota.PERPLEXITY && (
        <QuotaBar label="Perplexity calls" used={quota.PERPLEXITY.used} limit={quota.PERPLEXITY.limit} />
      )}
      {quota.CLAUDE_TOKENS && (
        <QuotaBar label="Claude tokens (this run)" used={quota.CLAUDE_TOKENS.used} limit={quota.CLAUDE_TOKENS.limit} />
      )}
      <div style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.4, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
        Reddit: rate-limited at 60 req/min — no monthly cap
      </div>
    </div>
  );
}

// ── Agent cards ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; bg: string }> = {
  NOT_STARTED: { label: "Not started", color: "var(--text-3)", bg: "var(--surface-2)" },
  RUNNING: { label: "Running…", color: "#1d4ed8", bg: "#eff6ff" },
  COMPLETED: { label: "Completed", color: "#15803d", bg: "#f0fdf4" },
  FAILED: { label: "Failed", color: "#b91c1c", bg: "#fef2f2" },
  BLOCKED_ON_CHECKPOINT: { label: "Checkpoint", color: "#b45309", bg: "#fffbeb" },
};

const AGENTS: AgentCard[] = [
  { name: "Intake", key: "intake", icon: "📋", phase: 1 },
  { name: "ICP Scout", key: "icp_scout", icon: "🎯", phase: 1, discoverEndpoint: "/api/accounts/discover" },
  { name: "Buyer Intel", key: "buyer_intel", icon: "👥", phase: 2, discoverEndpoint: "/api/buyers/discover" },
  { name: "Signal & Intel", key: "signal_intel", icon: "📡", phase: 2, discoverEndpoint: "/api/signals/discover" },
  { name: "Verifier", key: "verifier", icon: "✅", phase: 3 },
  { name: "Storyteller", key: "storyteller", icon: "✍️", phase: 4 },
  { name: "Campaign", key: "campaign", icon: "🚀", phase: 5 },
];

function AgentStatusCard({
  agent,
  run,
  clientId,
}: {
  agent: AgentCard;
  run: AgentRun | undefined;
  clientId: string;
}) {
  const status = run?.status ?? "NOT_STARTED";
  const cfg = STATUS_CONFIG[status];
  const trigger = useTriggerAgent(agent.discoverEndpoint ?? "");
  const isFuture = agent.phase > 2;

  return (
    <div
      className="card card-pad"
      style={{
        opacity: isFuture ? 0.5 : 1,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {isFuture && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.6)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-3)",
            zIndex: 1,
          }}
        >
          Coming in Phase {agent.phase}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20 }}>{agent.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{agent.name}</span>
      </div>

      <div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 10,
            background: cfg.bg,
            color: cfg.color,
          }}
        >
          {cfg.label}
        </span>
      </div>

      {run?.last_run && (
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>
          Last run: {new Date(run.last_run).toLocaleDateString()}
        </div>
      )}

      {run?.progress && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: "var(--text-3)" }}>Progress</span>
            <span style={{ color: "var(--text-2)" }}>
              {run.progress.processed}/{run.progress.total}
            </span>
          </div>
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(run.progress.processed / run.progress.total) * 100}%`,
                background: "var(--acc-600)",
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      )}

      {run?.last_error && (
        <div style={{ fontSize: 11, color: "#b91c1c", lineHeight: 1.4 }}>
          Error: {run.last_error}
        </div>
      )}

      {agent.discoverEndpoint && !isFuture && (
        <Btn
          size="sm"
          variant={status === "COMPLETED" ? "ghost" : "accent"}
          loading={trigger.isPending}
          onClick={() => trigger.mutate(clientId)}
        >
          {status === "COMPLETED" ? "Re-run" : status === "RUNNING" ? "Running…" : "Run"}
        </Btn>
      )}
    </div>
  );
}

// ── Recent runs log ───────────────────────────────────────────────────────────

function RecentRunsLog({ runs }: { runs: PipelineStatus["recent_runs"] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="card card-pad">
      <div className="section-eyebrow" style={{ marginBottom: 12 }}>Recent runs · last 20</div>
      {runs.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>No runs yet.</div>
      ) : (
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--text-3)", textAlign: "left" }}>
              <th style={{ padding: "4px 8px", fontWeight: 500 }}>Agent</th>
              <th style={{ padding: "4px 8px", fontWeight: 500 }}>Started</th>
              <th style={{ padding: "4px 8px", fontWeight: 500 }}>Duration</th>
              <th style={{ padding: "4px 8px", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "4px 8px", fontWeight: 500 }}>Records</th>
              <th style={{ padding: "4px 8px", fontWeight: 500 }}>Warnings</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const cfg = STATUS_CONFIG[run.status];
              const durationMs = run.finished
                ? new Date(run.finished).getTime() - new Date(run.started).getTime()
                : null;
              const duration = durationMs !== null
                ? durationMs < 60000
                  ? `${Math.round(durationMs / 1000)}s`
                  : `${Math.round(durationMs / 60000)}m`
                : "—";

              return (
                <>
                  <tr
                    key={i}
                    style={{
                      borderTop: "1px solid var(--border)",
                      cursor: run.warnings_count > 0 ? "pointer" : "default",
                    }}
                    onClick={() => run.warnings_count > 0 && setExpandedIdx(expandedIdx === i ? null : i)}
                  >
                    <td style={{ padding: "6px 8px", fontWeight: 500 }}>{run.agent}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-2)" }}>
                      {new Date(run.started).toLocaleString()}
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>{duration}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 8,
                          background: cfg.bg,
                          color: cfg.color,
                          fontWeight: 600,
                        }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>
                      {run.records_processed}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {run.warnings_count > 0 ? (
                        <span style={{ color: "#b45309", fontWeight: 600 }}>
                          {run.warnings_count} ▼
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                  </tr>
                  {expandedIdx === i && run.warnings && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: "8px 12px",
                          background: "#fffbeb",
                          fontSize: 11,
                          color: "#92400e",
                        }}
                      >
                        {run.warnings.map((w, wi) => (
                          <div key={wi}>{w}</div>
                        ))}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Needed import
import { useState } from "react";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id");
  const { data: pipeline } = usePipelineStatus(clientId);
  const { data: quota } = useQuotaStatus();

  if (!clientId) {
    return (
      <div className="page-body">
        <div
          className="card card-pad"
          style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13 }}
        >
          Provide a ?client_id= query parameter to view pipeline status.
        </div>
      </div>
    );
  }

  const runs = pipeline?.recent_runs ?? [];

  return (
    <>
      <div className="page-head">
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: "var(--font-display)",
            margin: 0,
          }}
        >
          Pipeline
        </h1>
        <div className="page-head-meta" style={{ marginLeft: 12, fontSize: 13 }}>
          client {clientId.slice(0, 8)}…
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Phase 4 lock banner — disappears when CP2 is approved */}
        <PhaseLockBanner clientId={clientId} />

        {/* Checkpoint banner */}
        <CheckpointStatusBar />

        {/* Agent flow + quota panel */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 240px",
            gap: 20,
            alignItems: "start",
          }}
        >
          {/* Agent cards */}
          <div>
            <div className="section-eyebrow" style={{ marginBottom: 12 }}>
              Phase 2 — Buyer Intel + Signal Intelligence
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {AGENTS.map((agent) => (
                <AgentStatusCard
                  key={agent.key}
                  agent={agent}
                  run={pipeline?.agents[agent.key]}
                  clientId={clientId}
                />
              ))}
            </div>
          </div>

          <QuotaPanel quota={quota} />
        </div>

        {/* Recent runs */}
        <RecentRunsLog runs={runs} />
      </div>
    </>
  );
}
