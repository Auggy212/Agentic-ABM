import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "@/components/ui/Icon";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAgents } from "@/hooks/useAgents";
import { usePipelineStage } from "@/hooks/usePipelineStage";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";
import type { EventTone } from "@/types/agents";

// ── Agent → run step mapping ──────────────────────────────────────────────────
const AGENT_STEP: Record<string, string> = {
  "icp-scout":        "icp_scout",
  "buyer-intel":      "buyer_intel",
  "signal-intel":     "signal_intel",
  "cp2-review":       "cp2_auto_approve",
  "verifier":         "verifier",
  "storyteller":      "storyteller",
};

const AGENT_NEXT_STEP: Array<{ key: string; label: string; hint: string }> = [
  { key: "icp_scout",    label: "Run ICP Scout",   hint: "Discover target accounts from your intake form." },
  { key: "buyer_intel",  label: "Run Buyer Intel",  hint: "Find buyers and map committee roles at each account." },
  { key: "signal_intel", label: "Run Signal Intel", hint: "Score accounts and generate Tier 1 intel reports." },
  { key: "verification", label: "Run Verifier",     hint: "Verify buyer emails and signals before messaging." },
  { key: "storyteller",  label: "Run Storyteller",  hint: "Generate personalised messages for each buyer." },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function toneIcon(tone: EventTone): Parameters<typeof Icon>[0]["name"] {
  if (tone === "found") return "check";
  if (tone === "warn")  return "warn";
  if (tone === "block") return "ban";
  return "play";
}

function statusStyle(status: string) {
  if (status === "running") return { dot: "var(--good-500)", label: "Running", bg: "var(--good-50)",  fg: "var(--good-700)" };
  if (status === "idle")    return { dot: "var(--ink-300)",  label: "Idle",    bg: "var(--ink-100)",  fg: "var(--text-3)"   };
  return                           { dot: "var(--acc-500)",  label: status,    bg: "var(--acc-50)",   fg: "var(--acc-700)"  };
}

// ── Automation hook ───────────────────────────────────────────────────────────
interface AutoRunStatus {
  run_id: string;
  status: "queued" | "running" | "complete" | "failed";
  current_step: string | null;
  completed_steps: string[];
  error: string | null;
}

function useRunStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (step: string) => {
      const { data } = await api.post("/api/pipeline/run-step", {
        client_id: getActiveClientId(),
        step,
      });
      return data as AutoRunStatus;
    },
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ["agents"] }), 2000);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["pipeline-stage"] }), 4000);
    },
  });
}

function useRunAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (steps?: string[]) => {
      const { data } = await api.post("/api/pipeline/run-all", {
        client_id: getActiveClientId(),
        steps: steps ?? null,
      });
      return data as AutoRunStatus & { steps: string[] };
    },
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ["agents"] }), 3000);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["pipeline-stage"] }), 6000);
    },
  });
}

// ── Pipeline run progress bar ─────────────────────────────────────────────────
const STEP_LABELS: Record<string, string> = {
  icp_scout:        "ICP Scout",
  buyer_intel:      "Buyer Intel",
  signal_intel:     "Signal Intel",
  cp2_auto_approve: "Auto-approve CP2",
  verifier:         "Verifier",
  storyteller:      "Storyteller",
};

function PipelineProgress({ runId }: { runId: string }) {
  const [status, setStatus] = useState<AutoRunStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const { data } = await api.get<AutoRunStatus>(`/api/pipeline/run-status/${runId}`);
        setStatus(data);
        if (data.status === "complete" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch { /* ignore */ }
    };
    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [runId]);

  if (!status) return null;

  const steps = ["icp_scout", "buyer_intel", "signal_intel", "cp2_auto_approve", "verifier", "storyteller"];

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
      padding: "16px 20px", marginBottom: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {status.status === "running" ? "⚙ Pipeline running…" :
           status.status === "complete" ? "✓ Pipeline complete" :
           status.status === "failed"   ? "✗ Pipeline failed" : "⏳ Queued"}
        </div>
        <span style={{
          fontSize: 11, fontFamily: "var(--font-mono)",
          color: status.status === "complete" ? "var(--good-700)" : status.status === "failed" ? "var(--bad-700)" : "var(--text-3)",
        }}>
          {status.completed_steps.length}/{steps.length} steps
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {steps.map((s) => {
          const done = status.completed_steps.includes(s);
          const active = status.current_step === s;
          const isFailed = status.status === "failed" && active && !done;
          return (
            <div key={s} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: done ? "var(--good-50)" : isFailed ? "var(--bad-50)" : active ? "var(--acc-100)" : "var(--surface-2)",
              color: done ? "var(--good-700)" : isFailed ? "var(--bad-700)" : active ? "var(--acc-700)" : "var(--text-3)",
              border: `1px solid ${done ? "var(--good-100)" : isFailed ? "var(--bad-200)" : active ? "var(--acc-200)" : "var(--border)"}`,
            }}>
              {done ? "✓" : active ? <span style={{ animation: "abm-pulse 1s infinite" }}>⚙</span> : "·"}
              {STEP_LABELS[s] ?? s}
            </div>
          );
        })}
      </div>
      {status.error && (
        <div style={{ marginTop: 10, color: "var(--bad-700)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
          Error: {status.error}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const { data, isLoading, isError } = useAgents();
  const { data: stage } = usePipelineStage();
  const runStep  = useRunStep();
  const runAll   = useRunAll();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runningSteps, setRunningSteps] = useState<Set<string>>(new Set());

  const nextStep = stage
    ? AGENT_NEXT_STEP.find((s) => (stage as unknown as Record<string, string>)[s.key] !== "done")
    : null;

  const handleRunStep = (agentId: string) => {
    const step = AGENT_STEP[agentId];
    if (!step) return;
    setRunningSteps((prev) => new Set(prev).add(step));
    runStep.mutate(step, {
      onSuccess: (data) => setActiveRunId(data.run_id),
      onSettled: () => setRunningSteps((prev) => { const n = new Set(prev); n.delete(step); return n; }),
    });
  };

  const handleRunAll = () => {
    runAll.mutate(undefined, {
      onSuccess: (data) => setActiveRunId(data.run_id),
    });
  };

  const handleRunRemaining = () => {
    if (!stage) return;
    const stepsToRun = ["icp_scout", "buyer_intel", "signal_intel", "cp2_auto_approve", "verifier", "storyteller"].filter(
      (s) => {
        const stageKey = s === "cp2_auto_approve" ? "checkpoint_2" : s === "icp_scout" ? "icp_scout" : s;
        return (stage as unknown as Record<string, string>)[stageKey] !== "done";
      }
    );
    if (!stepsToRun.length) return;
    runAll.mutate(stepsToRun, {
      onSuccess: (data) => setActiveRunId(data.run_id),
    });
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading agents" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ padding: 24 }}>
        <div className="empty-state">
          <div className="empty-icon">⚠</div>
          <div className="empty-title">Failed to load agent data</div>
          <div className="empty-sub">Check your connection and try again.</div>
        </div>
      </div>
    );
  }

  const { agents, events } = data;
  const runningCount = agents.filter((a) => a.status === "running").length;
  const isAutomating = runAll.isPending || (activeRunId != null && !runAll.isIdle && !runAll.isError);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Page Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Agent Console</div>
          <h1 className="ph-title">Live Agent Activity</h1>
          <p className="ph-subtitle">
            Run agents individually or automate the full pipeline with one click.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Agents</div>
            <div className="ph-kpi-num">{agents.length}</div>
          </div>
          <div className="ph-kpi" data-tone={runningCount > 0 ? "green" : undefined}>
            <div className="ph-kpi-label">Running</div>
            <div className="ph-kpi-num">{runningCount}</div>
          </div>
          <div className="ph-kpi">
            <div className="ph-kpi-label">Events</div>
            <div className="ph-kpi-num">{events.length}</div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: "grid", gap: 18 }}>

        {/* ── Automation controls ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
          background: "var(--acc-950)", border: "1px solid var(--acc-800)", borderRadius: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "var(--acc-200)", fontSize: 14 }}>
              🤖 Automated Pipeline
            </div>
            <div style={{ color: "var(--acc-400)", fontSize: 12, marginTop: 2 }}>
              Run the full pipeline end-to-end — ICP Scout → Buyer Intel → Signal Intel → CP2 → Verifier → Storyteller
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              className="btn-primary"
              disabled={isAutomating}
              onClick={handleRunRemaining}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              {isAutomating ? "Running…" : "▶ Run Remaining"}
            </button>
            <button
              style={{
                fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                background: "rgba(255,255,255,0.08)", color: "var(--acc-200)",
                border: "1px solid var(--acc-700)",
              }}
              disabled={isAutomating}
              onClick={handleRunAll}
            >
              ↺ Run All (Fresh)
            </button>
          </div>
        </div>

        {/* ── Pipeline progress ── */}
        {activeRunId && <PipelineProgress runId={activeRunId} />}

        {/* ── Next step hint ── */}
        {nextStep && !isAutomating && (
          <div style={{
            display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
            background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10,
          }}>
            <span style={{ fontSize: 16 }}>👉</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Next: {nextStep.label}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>{nextStep.hint}</div>
            </div>
          </div>
        )}

        {/* ── Agent cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {agents.map((a) => {
            const s = statusStyle(a.status);
            const step = AGENT_STEP[a.id];
            const isStepRunning = step ? runningSteps.has(step) : false;
            const canRun = !!step && a.status !== "running" && !isStepRunning && !isAutomating;

            return (
              <div key={a.id} className="card" style={{ borderRadius: 12, overflow: "hidden" }}>
                <div style={{ height: 3, background: s.dot, opacity: 0.7 }} />
                <div style={{ padding: "16px 18px", display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: "linear-gradient(135deg, var(--acc-600), var(--acc-800))",
                      color: "white", display: "grid", placeItems: "center", flexShrink: 0,
                    }}>
                      <Icon name={a.icon as Parameters<typeof Icon>[0]["name"]} size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3,
                        borderRadius: 999, background: s.bg, color: s.fg,
                        padding: "2px 8px", fontSize: 10.5, fontWeight: 700,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%", background: s.dot,
                          animation: a.status === "running" ? "abm-pulse 2s infinite" : undefined,
                        }} />
                        {isStepRunning ? "Queued…" : s.label}
                      </span>
                    </div>
                    {/* Run button */}
                    {step && (
                      <button
                        onClick={() => handleRunStep(a.id)}
                        disabled={!canRun}
                        style={{
                          flexShrink: 0, padding: "6px 14px", borderRadius: 8, fontSize: 12,
                          fontWeight: 700, cursor: canRun ? "pointer" : "not-allowed",
                          background: canRun ? "var(--acc-600)" : "var(--surface-2)",
                          color: canRun ? "#fff" : "var(--text-3)",
                          border: "none", transition: "background 0.15s",
                        }}
                      >
                        {a.status === "running" || isStepRunning ? "⚙…" : "▶ Run"}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>{a.description}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-mute)", fontFamily: "var(--font-mono)" }}>{a.runs}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Live Activity ── */}
        <div className="card" style={{ borderRadius: 12, overflow: "hidden" }}>
          <div style={{
            padding: "12px 18px", borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase",
              letterSpacing: "0.16em", color: "var(--text-mute)", fontWeight: 600,
            }}>
              Live Activity
            </div>
            <span style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, color: runningCount > 0 ? "var(--good-700)" : "var(--text-mute)",
              fontFamily: "var(--font-mono)",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: runningCount > 0 ? "var(--good-500)" : "var(--ink-300)",
                animation: runningCount > 0 ? "abm-pulse 2s infinite" : undefined,
              }} />
              {runningCount > 0 ? `${runningCount} active` : "idle"}
            </span>
          </div>

          {events.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <div className="empty-icon" style={{ margin: "0 auto 12px" }}>▶</div>
              <div className="empty-title">No activity yet</div>
              <div className="empty-sub">Click ▶ Run on any agent card above to start.</div>
            </div>
          ) : (
            <div className="agent-feed">
              {events.map((e) => (
                <div key={e.id} className="agent-event" data-tone={e.tone}>
                  <div className="agent-event-time">{e.time}</div>
                  <div className="agent-event-icon">
                    <Icon name={toneIcon(e.tone)} size={11} />
                  </div>
                  <div>
                    <div className="agent-event-title"><strong>{e.agent}</strong> · {e.title}</div>
                    <div className="agent-event-meta">{e.meta}</div>
                  </div>
                  <div className="agent-event-stat">{e.stat}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
