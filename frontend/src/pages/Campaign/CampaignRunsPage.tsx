import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { getActiveClientId } from "@/lib/session";
import {
  useActiveHalts, useCampaignRuns, useOutboundSends, useTriggerRun, useOperatorHalt, useResume,
} from "./hooks";
import type { CampaignRun, OutboundSend, CampaignHalt } from "./types";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_STYLE: Record<CampaignRun["status"], { color: string; bg: string; border: string }> = {
  RUNNING:   { color: "var(--acc-300)",  bg: "rgba(0,212,255,0.08)",  border: "rgba(0,212,255,0.25)"  },
  COMPLETED: { color: "var(--good-500)", bg: "rgba(0,255,150,0.08)",  border: "rgba(0,255,150,0.25)"  },
  HALTED:    { color: "var(--warn-500)", bg: "rgba(255,215,0,0.08)",  border: "rgba(255,215,0,0.25)"  },
  FAILED:    { color: "var(--bad-500)",  bg: "rgba(255,70,70,0.08)",  border: "rgba(255,70,70,0.25)"  },
};

const CHANNEL_ICON: Record<string, string> = {
  EMAIL: "📧", LINKEDIN_DM: "🔗", LINKEDIN_CONNECTION: "🔗",
  WHATSAPP: "💬", REDDIT_STRATEGY_NOTE: "🟠",
};

const SEND_COLOR: Record<string, string> = {
  SENT: "var(--good-500)", FAILED: "var(--bad-500)", PENDING_QUOTA_RESET: "var(--warn-500)",
  HALTED: "var(--bad-500)", QUEUED: "var(--text-3)", PENDING_COOKIE_REFRESH: "var(--warn-500)",
  PENDING_BUDGET: "var(--warn-500)",
};

// ── Trigger panel ─────────────────────────────────────────────────────────────

function TriggerPanel({ clientId, latestRun, activeHalt }: {
  clientId: string;
  latestRun: CampaignRun | null;
  activeHalt: CampaignHalt | null;
}) {
  const triggerRun = useTriggerRun(clientId);
  const operatorHalt = useOperatorHalt(clientId);
  const resume = useResume(clientId);
  const [haltDetail, setHaltDetail] = useState("");
  const [showHaltForm, setShowHaltForm] = useState(false);

  const isRunning = latestRun?.status === "RUNNING";
  const canTrigger = !triggerRun.isPending && !isRunning && !activeHalt;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        {/* Left */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 4 }}>
            Campaign Execution
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-display)" }}>
            Trigger a Run
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5, maxWidth: 440 }}>
            Dispatches all CP3-approved messages for this client via their configured transport (Email → Instantly, LinkedIn → PhantomBuster, SMS → Twilio).
          </div>
        </div>

        {/* Right: action buttons */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => triggerRun.mutate()}
            disabled={!canTrigger}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "11px 26px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: canTrigger ? "pointer" : "not-allowed",
              background: canTrigger ? "var(--acc-600)" : "var(--surface-3)",
              color: canTrigger ? "#fff" : "var(--text-3)",
              border: "none", transition: "background 0.15s",
              opacity: canTrigger ? 1 : 0.65,
            }}
          >
            <span>▶</span>
            {triggerRun.isPending ? "Queuing…" : isRunning ? "Run in progress…" : "Run Campaign"}
          </button>

          {!activeHalt && !isRunning && (
            <button
              onClick={() => setShowHaltForm((v) => !v)}
              style={{
                fontSize: 11, color: "var(--text-3)", background: "transparent",
                border: "1px solid var(--border)", borderRadius: 8, padding: "5px 12px",
                cursor: "pointer", fontWeight: 600,
              }}
            >
              ⏸ Manual halt
            </button>
          )}

          {triggerRun.isSuccess && (
            <span style={{ fontSize: 11, color: "var(--good-500)", fontWeight: 600 }}>✓ Run queued successfully</span>
          )}
          {triggerRun.isError && (
            <span style={{ fontSize: 11, color: "var(--bad-500)" }}>Failed — check CP3 is approved</span>
          )}
        </div>
      </div>

      {/* Active halt warning */}
      {activeHalt && (
        <div style={{
          background: "rgba(255,70,70,0.08)", border: "1px solid rgba(255,70,70,0.25)", borderRadius: 10,
          padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--bad-500)", marginBottom: 2 }}>
              ⚠ Campaign halted — {activeHalt.scope === "GLOBAL" ? "Global" : "Client"} halt active
            </div>
            <div style={{ fontSize: 12, color: "var(--bad-500)", opacity: 0.8 }}>{activeHalt.detail}</div>
            <div style={{ fontSize: 10, color: "var(--bad-500)", marginTop: 4, fontFamily: "var(--font-mono)", opacity: 0.7 }}>
              reason={activeHalt.reason} · by={activeHalt.triggered_by} · {fmtTime(activeHalt.triggered_at)}
            </div>
          </div>
          <button
            onClick={() => resume.mutate({ halt_id: activeHalt.halt_id, confirmation: "RESUME", resumed_by: "operator" })}
            disabled={resume.isPending}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: "rgba(255,70,70,0.12)", color: "var(--bad-500)", border: "1px solid rgba(255,70,70,0.30)", flexShrink: 0,
            }}
          >
            {resume.isPending ? "Resuming…" : "Resume"}
          </button>
        </div>
      )}

      {/* Inline halt form */}
      {showHaltForm && !activeHalt && (
        <div style={{
          background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--warn-500)" }}>Manual halt — stops all new sends until resumed</div>
          <textarea
            value={haltDetail}
            onChange={(e) => setHaltDetail(e.target.value)}
            placeholder="Reason for halting (e.g. client asked to pause while legal reviews sequence)"
            rows={2}
            style={{
              fontSize: 12, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,215,0,0.25)",
              background: "var(--surface-2)", resize: "vertical", fontFamily: "inherit", color: "var(--text)",
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowHaltForm(false)} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--text-2)" }}>
              Cancel
            </button>
            <button
              disabled={!haltDetail.trim() || operatorHalt.isPending}
              onClick={() => operatorHalt.mutate({ detail: haltDetail, triggered_by: "operator" }, { onSuccess: () => { setShowHaltForm(false); setHaltDetail(""); } })}
              style={{
                fontSize: 12, padding: "6px 14px", borderRadius: 7, fontWeight: 700, cursor: "pointer",
                background: haltDetail.trim() ? "rgba(255,70,70,0.15)" : "var(--surface-3)",
                color: haltDetail.trim() ? "var(--bad-500)" : "var(--text-3)", border: haltDetail.trim() ? "1px solid rgba(255,70,70,0.30)" : "none",
              }}
            >
              {operatorHalt.isPending ? "Halting…" : "Confirm Halt"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Run history card ──────────────────────────────────────────────────────────

function RunCard({ run, sends }: { run: CampaignRun; sends: OutboundSend[] }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLE[run.status];

  // Group sends by account domain
  const byDomain = useMemo(() => {
    const map: Record<string, OutboundSend[]> = {};
    for (const send of sends) {
      (map[send.account_domain] ??= []).push(send);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [sends]);

  return (
    <div style={{
      background: "var(--surface)", border: `1px solid ${s.border}`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {/* Run header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", textAlign: "left", padding: "16px 20px", background: "transparent",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          {/* Status badge */}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0,
            background: s.bg, color: s.color, border: `1px solid ${s.border}`,
          }}>
            {run.status}
          </span>

          {/* Counts */}
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-2)" }}>
            <span style={{ color: "var(--good-500)", fontWeight: 700 }}>{run.total_sent} sent</span>
            {run.total_failed > 0 && <span style={{ color: "var(--bad-500)", fontWeight: 700 }}>{run.total_failed} failed</span>}
            {run.total_pending > 0 && <span style={{ color: "#b45309", fontWeight: 700 }}>{run.total_pending} pending</span>}
            <span style={{ color: "var(--text-3)" }}>{run.total_messages} total</span>
          </div>

          {/* Halt reason */}
          {run.halt_reason && (
            <span style={{ fontSize: 11, color: "var(--bad-500)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
              {run.halt_reason}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600 }}>{relTime(run.started_at)}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 1 }}>
              {fmtTime(run.started_at)}
            </div>
          </div>
          <span style={{ fontSize: 14, color: "var(--text-3)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </div>
      </button>

      {/* Expanded: per-account breakdown */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {byDomain.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-3)", textAlign: "center", padding: "12px 0" }}>
              No outbound sends recorded for this run.
            </div>
          ) : (
            byDomain.map(([domain, domainSends]) => (
              <DomainSendRow key={domain} domain={domain} sends={domainSends} />
            ))
          )}

          {run.quota_warnings.length > 0 && (
            <div style={{ marginTop: 4, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e" }}>
              <strong>Quota warnings ({run.quota_warnings.length})</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                {run.quota_warnings.map((w, i) => <li key={i}>{w.source}: {w.detail}</li>)}
              </ul>
            </div>
          )}

          <div style={{ fontSize: 10, color: "var(--text-mute)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            run_id: {run.run_id}
            {run.finished_at && ` · finished ${fmtTime(run.finished_at)}`}
          </div>
        </div>
      )}
    </div>
  );
}

function DomainSendRow({ domain, sends }: { domain: string; sends: OutboundSend[] }) {
  const sent    = sends.filter((s) => s.status === "SENT").length;
  const failed  = sends.filter((s) => s.status === "FAILED").length;
  const pending = sends.filter((s) => !["SENT", "FAILED"].includes(s.status)).length;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8,
      border: "1px solid var(--border)", gap: 16, flexWrap: "wrap",
    }}>
      {/* Domain */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7, background: "var(--acc-100)",
          color: "var(--acc-700)", display: "grid", placeItems: "center",
          fontSize: 12, fontWeight: 800, flexShrink: 0,
        }}>
          {domain[0]?.toUpperCase()}
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {domain}
        </div>
      </div>

      {/* Per-channel breakdown */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {sends.map((s) => (
          <span key={s.send_id} title={`${s.channel} · ${s.status}${s.error_message ? " · " + s.error_message : ""}`} style={{
            fontSize: 11, padding: "3px 9px", borderRadius: 20, fontWeight: 600,
            background: "var(--surface)", border: "1px solid var(--border)",
            color: SEND_COLOR[s.status] ?? "var(--text-2)",
            cursor: "help",
          }}>
            {CHANNEL_ICON[s.channel] ?? "•"} {s.status}
          </span>
        ))}
      </div>

      {/* Summary counts */}
      <div style={{ display: "flex", gap: 10, fontSize: 12, flexShrink: 0 }}>
        {sent > 0    && <span style={{ color: "var(--good-500)", fontWeight: 700 }}>✓ {sent}</span>}
        {failed > 0  && <span style={{ color: "var(--bad-500)", fontWeight: 700 }}>✗ {failed}</span>}
        {pending > 0 && <span style={{ color: "#b45309", fontWeight: 700 }}>⏳ {pending}</span>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampaignRunsPage() {
  const [search] = useSearchParams();
  const clientId = search.get("client_id") || getActiveClientId();

  const runsQuery  = useCampaignRuns(clientId);
  const sendsQuery = useOutboundSends(clientId);
  const haltsQuery = useActiveHalts(clientId);

  const runs  = runsQuery.data?.runs ?? [];
  const sends = sendsQuery.data?.sends ?? [];
  const activeHalt = haltsQuery.data?.halts.find((h) => h.is_active) ?? null;
  const latestRun = runs[0] ?? null;

  const totalSent    = sends.filter((s) => s.status === "SENT").length;
  const totalFailed  = sends.filter((s) => s.status === "FAILED").length;
  const totalPending = sends.filter((s) => !["SENT", "FAILED"].includes(s.status)).length;

  // Map run_id → sends for that run
  const sendsByRun = useMemo(() => {
    const map: Record<string, OutboundSend[]> = {};
    for (const s of sends) {
      if (s.run_id) (map[s.run_id] ??= []).push(s);
    }
    return map;
  }, [sends]);

  if (runsQuery.isLoading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading campaign runs" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", minWidth: 0 }}>

      {/* ── Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Campaigns</div>
          <h1 className="ph-title">Campaign Runs</h1>
          <p className="ph-subtitle">
            Trigger outbound runs and track every send — by account, channel, and status.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Total Runs</div>
            <div className="ph-kpi-num">{runs.length}</div>
          </div>
          <div className="ph-kpi" data-tone={totalSent > 0 ? "green" : undefined}>
            <div className="ph-kpi-label">Sent</div>
            <div className="ph-kpi-num">{totalSent}</div>
          </div>
          <div className="ph-kpi" data-tone={totalFailed > 0 ? "red" : undefined}>
            <div className="ph-kpi-label">Failed</div>
            <div className="ph-kpi-num">{totalFailed}</div>
          </div>
          <div className="ph-kpi" data-tone={totalPending > 0 ? "amber" : undefined}>
            <div className="ph-kpi-label">Pending</div>
            <div className="ph-kpi-num">{totalPending}</div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Trigger panel ── */}
        <TriggerPanel clientId={clientId} latestRun={latestRun} activeHalt={activeHalt} />

        {/* ── Run history ── */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 10 }}>
            Run History · {runs.length} run{runs.length !== 1 ? "s" : ""}
          </div>

          {runs.length === 0 ? (
            <div style={{
              padding: "40px 24px", textAlign: "center", background: "var(--surface)",
              border: "1px dashed var(--border)", borderRadius: 14,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}>No runs yet</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                Trigger your first campaign run above. CP3 must be approved before any messages are dispatched.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {runs.map((run) => (
                <RunCard key={run.run_id} run={run} sends={sendsByRun[run.run_id] ?? []} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
