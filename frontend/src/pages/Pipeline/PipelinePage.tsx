import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";
import Btn from "@/components/ui/Btn";
import PhaseLockBanner from "@/pages/Checkpoint2/PhaseLockBanner";
import CP3PhaseLockBanner from "@/pages/Checkpoint3/PhaseLockBanner";

type AgentStatus = "NOT_STARTED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED_ON_CHECKPOINT" | "CANCELLED";

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
  { name: "Intake",       key: "intake",       phase: 1, icon: "📋" },
  { name: "ICP Scout",    key: "icp_scout",    phase: 1, icon: "🎯", endpoint: "/api/accounts/discover" },
  { name: "Buyer Intel",  key: "buyer_intel",  phase: 2, icon: "👥", endpoint: "/api/buyers/discover" },
  { name: "Signal Intel", key: "signal_intel", phase: 2, icon: "📡", endpoint: "/api/signals/discover" },
  { name: "Verifier",     key: "verifier",     phase: 3, icon: "✓"  },
  { name: "Storyteller",  key: "storyteller",  phase: 4, icon: "✍️", endpoint: "/api/storyteller/generate" },
  { name: "Campaign",     key: "campaign",     phase: 5, icon: "🚀" },
];

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string; bg: string; fg: string }> = {
  NOT_STARTED:          { label: "Not started",  dot: "var(--ink-300)",  bg: "var(--ink-100)", fg: "var(--text-3)"   },
  RUNNING:              { label: "Running",       dot: "var(--acc-300)", bg: "rgba(0,212,255,0.10)", fg: "var(--acc-300)" },
  COMPLETED:            { label: "Completed",     dot: "var(--good-500)", bg: "var(--good-50)", fg: "var(--good-700)" },
  FAILED:               { label: "Failed",        dot: "var(--bad-500)",  bg: "var(--bad-50)",  fg: "var(--bad-700)"  },
  BLOCKED_ON_CHECKPOINT:{ label: "Checkpoint",    dot: "var(--warn-500)", bg: "var(--warn-50)", fg: "var(--warn-700)" },
  CANCELLED:            { label: "Cancelled",     dot: "var(--ink-400)",  bg: "var(--ink-100)", fg: "var(--text-3)"   },
};

// ── Auto-Pilot ─────────────────────────────────────────────────────────────

type CheckpointGate = "CP2" | "CP3";

interface AutoPilotResult {
  active: boolean;
  checkpoint: { type: CheckpointGate; seconds: number } | null;
  enable: () => void;
  disable: () => void;
  cancelCheckpoint: () => void;
}

function useAutoPilot(
  clientId: string,
  agents: Record<string, AgentRun> | undefined,
  onInvalidate: () => void,
): AutoPilotResult {
  const [active, setActive] = useState<boolean>(() => {
    try { return localStorage.getItem("abm_autopilot") === "1"; } catch { return false; }
  });
  const [checkpoint, setCheckpoint] = useState<{ type: CheckpointGate; seconds: number } | null>(null);
  const prevStatuses = useRef<Record<string, string>>({});
  const triggered = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerEndpoint = useCallback(async (endpoint: string) => {
    try {
      await api.post(endpoint, { client_id: clientId });
      onInvalidate();
    } catch (_) { /* agent may already be running */ }
  }, [clientId, onInvalidate]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startCountdown = useCallback((type: CheckpointGate, onExpire: () => void) => {
    clearTimer();
    let secs = 10;
    setCheckpoint({ type, seconds: secs });
    timerRef.current = setInterval(() => {
      secs--;
      if (secs <= 0) {
        clearInterval(timerRef.current!); timerRef.current = null;
        setCheckpoint(null);
        onExpire();
      } else {
        setCheckpoint({ type, seconds: secs });
      }
    }, 1000);
  }, [clearTimer]);

  const cancelCheckpoint = useCallback(() => {
    clearTimer();
    setCheckpoint(null);
    triggered.current.delete("storyteller");
    triggered.current.delete("campaign");
  }, [clearTimer]);

  useEffect(() => {
    if (!active || !agents) return;
    const prev = prevStatuses.current;
    const s = (key: string) => agents[key]?.status ?? "NOT_STARTED";

    // Kick off ICP Scout on first activation
    if (!triggered.current.has("icp_scout") && s("icp_scout") === "NOT_STARTED") {
      triggered.current.add("icp_scout");
      triggerEndpoint("/api/accounts/discover");
    }

    // ICP Scout done → start Buyer Intel + Signal Intel in parallel
    if (prev.icp_scout !== "COMPLETED" && s("icp_scout") === "COMPLETED") {
      if (!triggered.current.has("buyer_intel")) {
        triggered.current.add("buyer_intel");
        triggerEndpoint("/api/buyers/discover");
      }
      if (!triggered.current.has("signal_intel")) {
        triggered.current.add("signal_intel");
        triggerEndpoint("/api/signals/discover");
      }
    }

    // Buyer Intel done → CP2 countdown → auto-approve → Storyteller
    if (prev.buyer_intel !== "COMPLETED" && s("buyer_intel") === "COMPLETED") {
      if (!triggered.current.has("storyteller")) {
        triggered.current.add("storyteller");
        startCountdown("CP2", async () => {
          await api.post(`/api/checkpoint-2/auto-approve?client_id=${clientId}`).catch(() => {});
          triggerEndpoint("/api/storyteller/generate");
          onInvalidate();
        });
      }
    }

    // Storyteller done → CP3 countdown → auto-approve → Campaign
    if (prev.storyteller !== "COMPLETED" && s("storyteller") === "COMPLETED") {
      if (!triggered.current.has("campaign")) {
        triggered.current.add("campaign");
        startCountdown("CP3", async () => {
          await api.post(`/api/checkpoint-3/auto-approve?client_id=${clientId}`).catch(() => {});
          onInvalidate();
        });
      }
    }

    prevStatuses.current = Object.fromEntries(
      Object.keys(agents).map((k) => [k, agents[k].status])
    );
  }, [active, agents, clientId, triggerEndpoint, startCountdown, onInvalidate]);

  const enable = useCallback(() => {
    triggered.current = new Set();
    prevStatuses.current = {};
    localStorage.setItem("abm_autopilot", "1");
    setActive(true);
  }, []);

  const disable = useCallback(() => {
    clearTimer();
    setCheckpoint(null);
    triggered.current = new Set();
    localStorage.setItem("abm_autopilot", "0");
    setActive(false);
  }, [clearTimer]);

  return { active, checkpoint, enable, disable, cancelCheckpoint };
}

function AutoPilotBanner({
  active,
  checkpoint,
  onEnable,
  onDisable,
  onCancelCheckpoint,
}: {
  active: boolean;
  checkpoint: AutoPilotResult["checkpoint"];
  onEnable: () => void;
  onDisable: () => void;
  onCancelCheckpoint: () => void;
}) {
  if (checkpoint) {
    return (
      <div style={{
        background: "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)",
        borderRadius: 12, padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 16,
        border: "1px solid rgba(0,212,255,0.25)",
        boxShadow: "0 4px 20px rgba(0,212,255,0.12)",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
          background: `conic-gradient(#00d4ff ${(checkpoint.seconds / 10) * 360}deg, rgba(0,212,255,0.15) 0deg)`,
          display: "grid", placeItems: "center",
        }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0f2744", display: "grid", placeItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 16, color: "#00d4ff" }}>{checkpoint.seconds}</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#e0e7ff" }}>
            Auto-approving {checkpoint.type === "CP2" ? "Checkpoint 2 (Buyer Intel)" : "Checkpoint 3 (Messages)"} in {checkpoint.seconds}s
          </div>
          <div style={{ fontSize: 12, color: "#a5b4fc", marginTop: 3 }}>
            {checkpoint.type === "CP2"
              ? "All buyer claims and accounts will be approved automatically."
              : "All messages and buyers will be approved, campaign will launch."}
          </div>
        </div>
        <button
          onClick={onCancelCheckpoint}
          style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#e0e7ff", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          Review manually →
        </button>
      </div>
    );
  }

  if (active) {
    return (
      <div style={{
        background: "linear-gradient(135deg, #0f2a1e 0%, #0a1f16 100%)",
        borderRadius: 12, padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 14,
        border: "1px solid rgba(16,185,129,0.3)",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981", animation: "pulse 1.5s infinite" }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: "#6ee7b7" }}>Auto-Pilot active</span>
          <span style={{ fontSize: 12.5, color: "#6ee7b7", opacity: 0.7, marginLeft: 10 }}>Agents will trigger automatically. Checkpoints show a 10s review window before proceeding.</span>
        </div>
        <button
          onClick={onDisable}
          style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#d1fae5", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          Pause
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--surface-2)", borderRadius: 12, padding: "14px 20px",
      display: "flex", alignItems: "center", gap: 14,
      border: "1px solid var(--border)",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>Auto-Pilot mode</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
          Run all agents sequentially from ICP Scout → Campaign with 10-second checkpoint review windows.
        </div>
      </div>
      <button
        onClick={onEnable}
        style={{
          padding: "8px 18px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
          background: "linear-gradient(135deg, var(--acc-500), var(--acc-700))",
          border: "none", color: "white", fontWeight: 700, fontSize: 13,
          boxShadow: "0 0 16px rgba(0,212,255,0.35), 0 2px 10px rgba(0,0,0,0.4)",
        }}
      >
        ⚡ Enable Auto-Pilot
      </button>
    </div>
  );
}

// ── Pipeline status query ───────────────────────────────────────────────────

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
    onError: () => {},
  });
}

function QuotaBar({ label, used, limit, money }: { label: string; used: number; limit: number; money?: boolean }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct >= 90 ? "var(--bad-500)" : pct >= 70 ? "var(--warn-500)" : "var(--good-500)";
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: "var(--text-2)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-mute)", fontSize: 11 }}>
          {money ? `$${used.toFixed(2)} / $${limit.toFixed(0)}` : `${used} / ${limit}`}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--ink-150)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
}

function QuotaPanel({ quota }: { quota?: QuotaStatus }) {
  return (
    <div className="card card-pad" style={{ borderRadius: 12, display: "grid", gap: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-mute)", fontWeight: 600 }}>
        API Quota
      </div>
      {!quota ? (
        <div style={{ color: "var(--text-mute)", fontSize: 13 }}>Loading quotas…</div>
      ) : (
        <>
          <QuotaBar label="Apollo contacts"       used={quota.APOLLO_CONTACTS.used}    limit={quota.APOLLO_CONTACTS.limit} />
          <QuotaBar label="Hunter verifications"  used={quota.HUNTER.used}             limit={quota.HUNTER.limit} />
          <QuotaBar label="Lusha enrichments"     used={quota.LUSHA.used}              limit={quota.LUSHA.limit} />
          {quota.NEVERBOUNCE      && <QuotaBar label="NeverBounce"    used={quota.NEVERBOUNCE.used}      limit={quota.NEVERBOUNCE.limit} />}
          {quota.ZEROBOUNCE       && <QuotaBar label="ZeroBounce"     used={quota.ZEROBOUNCE.used}       limit={quota.ZEROBOUNCE.limit} />}
          {quota.ANTHROPIC_CLAUDE && <QuotaBar label="Anthropic Claude" used={quota.ANTHROPIC_CLAUDE.used} limit={quota.ANTHROPIC_CLAUDE.limit} money />}
          {quota.OPENAI_GPT_4O_MINI && <QuotaBar label="OpenAI GPT-4o" used={quota.OPENAI_GPT_4O_MINI.used} limit={quota.OPENAI_GPT_4O_MINI.limit} money />}
        </>
      )}
    </div>
  );
}

function CheckpointStatusBar({ status = "OPERATOR_REVIEW", clientId }: { status?: string; clientId: string }) {
  const tone = status === "APPROVED" ? "good" : "warn";
  const copy =
    status === "CLIENT_REVIEW"      ? "CP3 awaiting client review" :
    status === "CHANGES_REQUESTED"  ? "CP3 — client requested changes" :
    status === "APPROVED"           ? "CP3 approved by client — campaign is unlocked" :
    "CP3 operator review in progress";
  return (
    <div className="banner" data-tone={tone} style={{ borderRadius: 12 }}>
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
  const cfg    = STATUS_CONFIG[status];
  const trigger = useTriggerAgent(agent.endpoint);
  const future  = agent.phase > 4;
  const progress = run?.progress;
  const progressPct = progress ? Math.round((progress.processed / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div className="card" style={{ borderRadius: 12, opacity: future ? 0.55 : 1, display: "grid", gap: 0, overflow: "hidden", transition: "box-shadow 0.2s, transform 0.2s" }}>
      {/* Color accent top strip */}
      <div style={{ height: 3, background: cfg.dot, opacity: 0.7 }} />

      <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{agent.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{agent.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Phase {agent.phase}
              </div>
            </div>
          </div>
          <span style={{
            borderRadius: 999, background: cfg.bg, color: cfg.fg,
            padding: "2px 9px", fontSize: 11, fontWeight: 700,
            border: `1px solid ${cfg.dot}22`,
            display: "inline-flex", alignItems: "center", gap: 5,
            whiteSpace: "nowrap",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
            {future ? `Phase ${agent.phase}` : cfg.label}
          </span>
        </div>

        {progress && (
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-mute)" }}>
              <span>Progress</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{progress.processed} / {progress.total}</span>
            </div>
            <div style={{ height: 5, background: "var(--ink-150)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--acc-500)", borderRadius: 999, transition: "width 0.6s" }} />
            </div>
          </div>
        )}

        {run?.cost_so_far && (
          <div style={{ fontSize: 11.5, color: "var(--text-mute)", fontFamily: "var(--font-mono)" }}>
            Claude ${run.cost_so_far.claude.toFixed(2)} · GPT ${run.cost_so_far.gpt.toFixed(2)} · Total ${run.cost_so_far.total.toFixed(2)}
          </div>
        )}

        {run?.warning && (
          <div style={{ color: "var(--warn-700)", fontSize: 12, background: "var(--warn-50)", borderRadius: 6, padding: "5px 8px", border: "1px solid rgba(212,148,10,0.2)" }}>
            {run.warning}
          </div>
        )}

        {agent.endpoint && !future && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn size="sm" variant={status === "COMPLETED" ? "ghost" : "accent"} loading={trigger.isPending} onClick={() => trigger.mutate(clientId)}>
                {status === "COMPLETED" ? "Re-run" : "Run agent"}
              </Btn>
              {agent.key === "storyteller" && (
                <Link className="btn btn-sm" to={`/storyteller?client_id=${clientId}`}>View Output</Link>
              )}
            </div>
            {trigger.isError && (
              <div className="inline-error">
                {(() => {
                  const detail = (trigger.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                  if (!detail) return "Run failed — check prerequisites";
                  if (detail.toLowerCase().includes("cp2") || detail.toLowerCase().includes("not approved")) {
                    return "CP2 must be approved before running Storyteller. Go to the Checkpoint 2 tab and approve.";
                  }
                  return detail;
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RecentRunsLog({ runs }: { runs: PipelineStatus["recent_runs"] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (runs.length === 0) return null;

  return (
    <div className="card" style={{ borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-mute)", fontWeight: 600 }}>
          Recent Runs
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="grid" style={{ fontSize: 13, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "16%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Agent</th><th>Started</th><th>Status</th><th>Records</th><th>Warnings</th><th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, index) => {
              const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.NOT_STARTED;
              return (
                <Fragment key={`${run.agent}-${run.started}`}>
                  <tr
                    style={{ cursor: run.warnings_count ? "pointer" : "default" }}
                    onClick={() => run.warnings_count && setExpanded(expanded === index ? null : index)}
                  >
                    <td style={{ fontWeight: 700 }}>{run.agent}</td>
                    <td style={{ color: "var(--text-2)" }}>{new Date(run.started).toLocaleString()}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, background: cfg.bg, color: cfg.fg, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.dot }} />
                        {run.status}
                      </span>
                    </td>
                    <td className="col-num">{run.records_processed}</td>
                    <td style={{ color: run.warnings_count ? "var(--warn-700)" : "var(--text-mute)" }}>
                      {run.warnings_count || <span style={{ color: "var(--text-mute)" }}>—</span>}
                    </td>
                    <td className="col-num">
                      {run.estimated_cost ? `$${run.estimated_cost.toFixed(2)}` : <span style={{ color: "var(--text-mute)" }}>—</span>}
                    </td>
                  </tr>
                  {expanded === index && run.warnings && (
                    <tr>
                      <td colSpan={6} style={{ padding: "10px 16px", background: "var(--warn-50)", color: "var(--warn-700)", fontSize: 12 }}>
                        {run.warnings.join(" · ")}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id") || getActiveClientId();
  const qc = useQueryClient();
  const { data: pipeline } = usePipelineStatus(clientId);
  const { data: quota }    = useQuotaStatus();
  const runs = pipeline?.recent_runs ?? [];

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ["pipeline-status"] }), [qc]);
  const autoPilot = useAutoPilot(clientId, pipeline?.agents, invalidate);

  const completedCount = pipeline ? Object.values(pipeline.agents).filter((a) => a.status === "COMPLETED").length : 0;
  const runningCount   = pipeline ? Object.values(pipeline.agents).filter((a) => a.status === "RUNNING").length   : 0;

  return (
    <>
      {/* ── Page Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Pipeline Console</div>
          <h1 className="ph-title">Agent Orchestration</h1>
          <p className="ph-subtitle">
            Trigger, monitor, and manage all seven AI agents from a single control panel. Track progress, costs, and checkpoint approvals.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Client</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1, marginTop: 6, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
              {clientId.slice(0, 8)}
            </div>
          </div>
          <div className="ph-kpi" data-tone="green">
            <div className="ph-kpi-label">Completed</div>
            <div className="ph-kpi-num">{completedCount}</div>
          </div>
          {runningCount > 0 && (
            <div className="ph-kpi" data-tone="amber">
              <div className="ph-kpi-label">Running</div>
              <div className="ph-kpi-num">{runningCount}</div>
            </div>
          )}
        </div>
      </div>

      <div className="page-body" style={{ display: "grid", gap: 18 }}>
        <AutoPilotBanner
          active={autoPilot.active}
          checkpoint={autoPilot.checkpoint}
          onEnable={autoPilot.enable}
          onDisable={autoPilot.disable}
          onCancelCheckpoint={autoPilot.cancelCheckpoint}
        />
        <PhaseLockBanner clientId={clientId} />
        <CP3PhaseLockBanner clientId={clientId} approved={pipeline?.cp3_status === "APPROVED"} />
        <CheckpointStatusBar clientId={clientId} status={pipeline?.cp3_status} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {AGENTS.map((agent) => (
              <AgentStatusCard key={agent.key} agent={agent} run={pipeline?.agents[agent.key]} clientId={clientId} />
            ))}
          </div>
          <QuotaPanel quota={quota} />
        </div>

        <RecentRunsLog runs={runs} />
      </div>
    </>
  );
}
