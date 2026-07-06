import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunStatus {
  status: "idle" | "running" | "done" | "error";
  message: string;
  jobId?: string;
  startedAt?: number;
}

interface PipelineRunStatus {
  run_id: string;
  status: "queued" | "running" | "complete" | "failed";
  current_step: string | null;
  completed_steps: string[];
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Skeleton({ w = "100%", h = 16, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec" }} />;
}

function elapsed(startedAt?: number) {
  if (!startedAt) return "";
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Pipeline progress bar ─────────────────────────────────────────────────────

const PIPELINE_STEPS: { key: string; label: string }[] = [
  { key: "icp_scout",        label: "ICP Scout" },
  { key: "buyer_intel",      label: "Buyer Intel" },
  { key: "signal_intel",     label: "Signal Intel" },
  { key: "cp2_auto_approve", label: "CP2 Review" },
  { key: "verifier",         label: "Verifier" },
  { key: "storyteller",      label: "Storyteller" },
];

function PipelineProgress({ runId, onDone }: { runId: string; onDone: () => void }) {
  const [status, setStatus] = useState<PipelineRunStatus | null>(null);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const { data } = await api.get<PipelineRunStatus>(`/api/pipeline/run-status/${runId}`);
        setStatus(data);
        if (data.status === "complete" || data.status === "failed") {
          if (ref.current) clearInterval(ref.current);
          onDone();
        }
      } catch { /* ignore */ }
    };
    poll();
    ref.current = setInterval(poll, 2000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [runId, onDone]);

  if (!status) return null;

  const done = status.status === "complete";
  const failed = status.status === "failed";

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e7e7e3",
      borderRadius: 6,
      padding: "14px 16px",
      marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: done ? "#047857" : failed ? "#be123c" : "#1a1d23" }}>
          {done ? "✓ Pipeline complete" : failed ? "✗ Pipeline failed" : "⚙ Pipeline running…"}
        </span>
        <span style={{ fontSize: 12, color: "#8a8f9e" }}>
          {status.completed_steps.length}/{PIPELINE_STEPS.length} steps
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PIPELINE_STEPS.map(({ key, label }) => {
          const isDone   = status.completed_steps.includes(key);
          const isActive = status.current_step === key;
          const isFailed = failed && isActive;
          return (
            <span key={key} style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 20,
              background: isDone ? "#e6f4ee" : isFailed ? "#fdeef0" : isActive ? "#eef0fb" : "#f5f5f1",
              color:      isDone ? "#047857" : isFailed ? "#be123c" : isActive ? "#4338ca" : "#8a8f9e",
              border: `1px solid ${isDone ? "#bbf7d0" : isFailed ? "#fecdd3" : isActive ? "#c7d2fe" : "#ededea"}`,
            }}>
              {isDone ? "✓ " : isActive ? "⚙ " : ""}{label}
            </span>
          );
        })}
      </div>
      {status.error && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#be123c", fontFamily: "monospace", wordBreak: "break-all" }}>
          {status.error}
        </div>
      )}
    </div>
  );
}

// ── Agent card config ─────────────────────────────────────────────────────────

interface AgentDef {
  id: string;
  step: string;
  label: string;
  description: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}

const AGENTS: AgentDef[] = [
  {
    id: "icp-scout",
    step: "icp_scout",
    label: "ICP Scout",
    description: "Discovers and scores target accounts from Apollo, Crunchbase, BuiltWith and other sources based on your intake form.",
    icon: "⌂",
    iconBg: "#eef1f5",
    iconColor: "#475569",
  },
  {
    id: "buyer-intel",
    step: "buyer_intel",
    label: "Buyer Intel",
    description: "Enriches buying-committee contacts for all discovered accounts via Apollo people search. Returns emails and phone numbers.",
    icon: "◎",
    iconBg: "#eef0fb",
    iconColor: "#4338ca",
  },
  {
    id: "signal-intel",
    step: "signal_intel",
    label: "Signal Intel",
    description: "Scans news, LinkedIn jobs, Reddit and G2 for buying signals across all target accounts.",
    icon: "◉",
    iconBg: "#fbf1e3",
    iconColor: "#b45309",
  },
  {
    id: "verifier",
    step: "verifier",
    label: "Verifier",
    description: "Verifies buyer emails and detects job changes before outreach messages are generated.",
    icon: "✓",
    iconBg: "#e6f4ee",
    iconColor: "#047857",
  },
  {
    id: "storyteller",
    step: "storyteller",
    label: "Storyteller",
    description: "Generates personalised outreach messages for each buyer using signal context and pain points.",
    icon: "✉",
    iconBg: "#f1edfb",
    iconColor: "#7c3aed",
  },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const clientId = getActiveClientId();
  const qc = useQueryClient();

  const [runStates, setRunStates] = useState<Record<string, RunStatus>>(
    () => Object.fromEntries(AGENTS.map((a) => [a.step, { status: "idle", message: "" }]))
  );
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [, setTick] = useState(0);

  // Re-render every second while something is running (for elapsed timer)
  const anyRunning = Object.values(runStates).some((s) => s.status === "running") || pipelineRunning;
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  function patchState(step: string, patch: Partial<RunStatus>) {
    setRunStates((prev) => ({ ...prev, [step]: { ...prev[step], ...patch } }));
  }

  async function runStep(agent: AgentDef) {
    if (runStates[agent.step].status === "running") return;
    patchState(agent.step, { status: "running", message: "Sending to pipeline…", startedAt: Date.now() });
    try {
      const { data } = await api.post("/api/pipeline/run-step", {
        client_id: clientId,
        step: agent.step,
      });
      setPipelineRunId(data.run_id);
      patchState(agent.step, { message: `Job queued — ID: ${data.run_id?.slice(0, 8)}…` });
      // Mark done after background task completes (poll handled by PipelineProgress)
      setTimeout(() => {
        patchState(agent.step, { status: "done", message: "Complete — check the relevant page for results." });
        qc.invalidateQueries({ queryKey: ["buyers", clientId] });
        qc.invalidateQueries({ queryKey: ["accounts", clientId] });
      }, 12000);
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data?: { detail?: string } } };
      const detail = e?.response?.data?.detail ?? String(err);
      patchState(agent.step, { status: "error", message: `${e?.response?.status ?? "Network error"}: ${detail}` });
    }
  }

  async function runAll(fresh: boolean) {
    if (pipelineRunning) return;
    setPipelineRunning(true);
    try {
      const { data } = await api.post("/api/pipeline/run-all", {
        client_id: clientId,
        steps: fresh ? null : undefined,
      });
      setPipelineRunId(data.run_id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(`Pipeline start failed: ${e?.response?.data?.detail ?? String(err)}`);
      setPipelineRunning(false);
    }
  }

  // Stats
  const { data: accountData, isLoading: accLoading } = useQuery({
    queryKey: ["accounts", clientId],
    queryFn: async () => {
      const { data } = await api.get(`/api/accounts?client_id=${clientId}&page_size=1`);
      return data;
    },
  });

  const { data: buyerData, isLoading: buyerLoading } = useQuery({
    queryKey: ["buyers", clientId],
    queryFn: async () => {
      const { data } = await api.get(`/api/buyers?client_id=${clientId}`);
      return data;
    },
  });

  const totalAccounts = accountData?.total ?? 0;
  const totalContacts = buyerData?.meta?.total_contacts_found ?? 0;
  const pendingDomains: string[] = buyerData?.meta?.pending_domains ?? [];
  const buyerRunStatus: string = buyerData?.meta?.status ?? "—";

  const stats = [
    { label: "Accounts discovered", value: totalAccounts, loading: accLoading,  icon: "⌂", iconBg: "#eef1f5", iconColor: "#475569" },
    { label: "Contacts enriched",   value: totalContacts, loading: buyerLoading, icon: "◎", iconBg: "#eef0fb", iconColor: "#4338ca" },
    { label: "Pending domains",     value: pendingDomains.length, loading: buyerLoading, icon: "⏳", iconBg: "#fbf1e3", iconColor: "#b45309" },
    { label: "Last Buyer Intel",    value: buyerRunStatus, loading: buyerLoading, icon: "◉", iconBg: "#e6f4ee", iconColor: "#047857" },
  ];

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Agent Control Panel
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>
          Manually trigger pipeline agents or run the full pipeline end-to-end.
        </p>
      </div>

      {/* ── Stat row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            background: "#fff",
            border: "1px solid #e7e7e3",
            borderRadius: 6,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: s.iconBg, color: s.iconColor,
              display: "grid", placeItems: "center", fontSize: 16,
            }}>
              {s.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              {s.loading
                ? <Skeleton w={48} h={20} />
                : <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1d23" }}>{s.value}</div>
              }
              <div style={{ fontSize: 11, color: "#8a8f9e", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pipeline automation bar ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #e7e7e3",
        borderRadius: 6,
        padding: "14px 16px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1d23", marginBottom: 2 }}>
            Full Pipeline
          </div>
          <div style={{ fontSize: 12, color: "#8a8f9e" }}>
            ICP Scout → Buyer Intel → Signal Intel → CP2 → Verifier → Storyteller
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => runAll(false)}
            disabled={pipelineRunning}
            style={{
              height: 34, padding: "0 16px", borderRadius: 6,
              border: "1px solid #e7e7e3",
              background: pipelineRunning ? "#f5f5f1" : "#fff",
              cursor: pipelineRunning ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 500,
              color: pipelineRunning ? "#c4c4be" : "#3a3f4c",
            }}
          >
            {pipelineRunning ? "Running…" : "▶ Run remaining"}
          </button>
          <button
            onClick={() => runAll(true)}
            disabled={pipelineRunning}
            style={{
              height: 34, padding: "0 16px", borderRadius: 6,
              border: "1px solid #e7e7e3",
              background: "#f5f5f1",
              cursor: pipelineRunning ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 500,
              color: pipelineRunning ? "#c4c4be" : "#8a8f9e",
            }}
          >
            ↺ Run all fresh
          </button>
        </div>
      </div>

      {/* ── Pipeline progress ── */}
      {pipelineRunId && (
        <PipelineProgress
          runId={pipelineRunId}
          onDone={() => {
            setPipelineRunning(false);
            qc.invalidateQueries({ queryKey: ["buyers", clientId] });
            qc.invalidateQueries({ queryKey: ["accounts", clientId] });
          }}
        />
      )}

      {/* ── Pending domains warning ── */}
      {pendingDomains.length > 0 && (
        <div style={{
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 6,
          padding: "12px 16px",
          marginBottom: 14,
          fontSize: 13,
          color: "#92400e",
        }}>
          <strong>{pendingDomains.length} domain(s) skipped</strong> due to quota — re-run Buyer Intel when credits reset.
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pendingDomains.map((d) => (
              <span key={d} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 4,
                background: "rgba(245,158,11,0.12)", color: "#92400e",
                border: "1px solid #fde68a",
              }}>
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Agent cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {AGENTS.map((agent) => {
          const state = runStates[agent.step];
          const running = state.status === "running";
          const done    = state.status === "done";
          const error   = state.status === "error";

          const pillBg    = running ? "#fbf1e3" : done ? "#e6f4ee" : error ? "#fdeef0" : "#f5f5f1";
          const pillColor = running ? "#b45309" : done ? "#047857" : error ? "#be123c" : "#8a8f9e";
          const pillLabel = running ? `Running · ${elapsed(state.startedAt)}` : done ? "Complete" : error ? "Failed" : "Ready";

          return (
            <div key={agent.id} style={{
              background: "#fff",
              border: "1px solid #e7e7e3",
              borderRadius: 6,
              padding: "16px 17px",
            }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                  background: agent.iconBg, color: agent.iconColor,
                  display: "grid", placeItems: "center", fontSize: 18,
                }}>
                  {agent.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1d23" }}>{agent.label}</div>
                  <span style={{
                    display: "inline-block", marginTop: 3,
                    fontSize: 10.5, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 20, background: pillBg, color: pillColor,
                  }}>
                    {pillLabel}
                  </span>
                </div>
                <button
                  onClick={() => runStep(agent)}
                  disabled={running || pipelineRunning}
                  style={{
                    flexShrink: 0,
                    height: 32, padding: "0 14px", borderRadius: 6,
                    border: "1px solid #e7e7e3",
                    background: running || pipelineRunning ? "#f5f5f1" : "#fff",
                    cursor: running || pipelineRunning ? "not-allowed" : "pointer",
                    fontSize: 12.5, fontWeight: 500,
                    color: running || pipelineRunning ? "#c4c4be" : "#3a3f4c",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}
                >
                  {running
                    ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg> Running</>
                    : <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run</>
                  }
                </button>
              </div>

              {/* Description */}
              <div style={{ fontSize: 12.5, color: "#8a8f9e", lineHeight: 1.55 }}>
                {agent.description}
              </div>

              {/* Status message */}
              {state.message && (
                <div style={{
                  marginTop: 10,
                  fontSize: 12,
                  padding: "7px 10px",
                  borderRadius: 5,
                  background: error ? "#fff5f5" : "#f5f5f1",
                  color: error ? "#be123c" : "#6b7180",
                  fontFamily: error ? "monospace" : "inherit",
                  wordBreak: "break-all",
                  lineHeight: 1.4,
                }}>
                  {state.message}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
