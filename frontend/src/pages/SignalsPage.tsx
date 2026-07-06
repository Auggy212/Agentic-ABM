import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { getActiveClientId } from "@/lib/session";
import { useDiscoverSignals, useCancelSignals, useSignalRunStatus, useSignalsByClient } from "./Accounts/signals/hooks";
import { useAccounts } from "./Accounts/hooks";
import type { SignalReport, BuyingStage } from "./Accounts/signals/types";
import SignalTimeline from "./Accounts/signals/SignalTimeline";
import SignalScoreCard from "./Accounts/signals/SignalScoreCard";

const STAGE_LABEL: Record<string, string> = {
  UNAWARE:        "Unaware",
  PROBLEM_AWARE:  "Problem aware",
  SOLUTION_AWARE: "Solution aware",
  EVALUATING:     "Evaluating",
  READY_TO_BUY:   "Ready to buy",
};

const STAGE_ICON: Record<string, string> = {
  READY_TO_BUY:   "🔥",
  EVALUATING:     "🔎",
  SOLUTION_AWARE: "💡",
  PROBLEM_AWARE:  "🤔",
  UNAWARE:        "😶",
};

function logoColor(name: string): string {
  const colors = ["#8b5cf6","#00d4ff","#00ff96","#ffd700","#ff4646","#a78bfa","#f472b6","#2dd4bf","#fb923c","#60a5fa"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

function IntentBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? "var(--good-500)" : pct >= 40 ? "var(--warn-500)" : "var(--ink-300)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--ink-150)", borderRadius: 999, overflow: "hidden", minWidth: 60 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-2)", minWidth: 22, textAlign: "right" }}>{score}</span>
    </div>
  );
}

// ── Buying stage config (reused in drawer) ────────────────────────────────────

const STAGES: BuyingStage[] = ["UNAWARE", "PROBLEM_AWARE", "SOLUTION_AWARE", "EVALUATING", "READY_TO_BUY"];
const STAGE_LABELS: Record<BuyingStage, string> = {
  UNAWARE: "Unaware", PROBLEM_AWARE: "Problem Aware", SOLUTION_AWARE: "Solution Aware",
  EVALUATING: "Evaluating", READY_TO_BUY: "Ready to Buy",
};
const STAGE_COLORS: Record<BuyingStage, { active: string }> = {
  UNAWARE:        { active: "var(--text-3)"   },
  PROBLEM_AWARE:  { active: "var(--warn-500)" },
  SOLUTION_AWARE: { active: "var(--acc-300)"  },
  EVALUATING:     { active: "var(--vio-500)"  },
  READY_TO_BUY:   { active: "var(--good-500)" },
};

// ── Signal detail drawer ──────────────────────────────────────────────────────

function SignalDrawer({ report, onClose }: { report: SignalReport; onClose: () => void }) {
  const activeIdx = STAGES.indexOf(report.buying_stage);
  const colors = STAGE_COLORS[report.buying_stage];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200,
          animation: "fadeIn 0.15s ease",
        }}
      />
      {/* Drawer panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(640px, 92vw)",
        background: "var(--surface)", boxShadow: "-8px 0 32px rgba(0,0,0,0.18)",
        zIndex: 201, overflowY: "auto", display: "flex", flexDirection: "column",
        animation: "slideInRight 0.2s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 2 }}>
              Signal Detail
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-display)" }}>
              {report.account_domain}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
              width: 32, height: 32, cursor: "pointer", fontSize: 16, color: "var(--text-2)",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}
          >✕</button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Buying stage strip */}
          <div className="card card-pad">
            <div className="section-eyebrow" style={{ marginBottom: 10 }}>Buying Stage</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {STAGES.map((s, idx) => (
                <div key={s} style={{ flex: 1 }}>
                  <div style={{
                    height: 7, borderRadius: 4,
                    background: s === report.buying_stage
                      ? STAGE_COLORS[s].active
                      : idx < activeIdx ? STAGE_COLORS[s].active + "55" : "var(--border)",
                  }} />
                  <div style={{ fontSize: 8.5, marginTop: 3, fontWeight: s === report.buying_stage ? 700 : 400, color: s === report.buying_stage ? STAGE_COLORS[s].active : "var(--text-3)", whiteSpace: "nowrap" }}>
                    {STAGE_LABELS[s]}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.active, fontFamily: "var(--font-display)" }}>
              {STAGE_LABELS[report.buying_stage]}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 6, lineHeight: 1.5 }}>
              {report.buying_stage_reasoning}
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                background: report.buying_stage_method === "LLM_TIEBREAKER" ? "#f5f3ff" : "var(--surface-2)",
                color: report.buying_stage_method === "LLM_TIEBREAKER" ? "#7c3aed" : "var(--text-3)",
                border: report.buying_stage_method === "LLM_TIEBREAKER" ? "1px solid #c4b5fd" : "1px solid var(--border)",
              }}>
                Classified by {report.buying_stage_method === "LLM_TIEBREAKER" ? "LLM Tiebreaker" : "Rules"}
              </span>
            </div>
          </div>

          {/* Outreach approach */}
          <div className="card card-pad" style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            <div className="section-eyebrow" style={{ marginBottom: 6 }}>Recommended Outreach Approach</div>
            {report.recommended_outreach_approach}
          </div>

          {/* Score + timeline */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 16, alignItems: "start" }}>
            <div className="card card-pad">
              <div className="section-eyebrow" style={{ marginBottom: 12 }}>
                Signals · {report.signals.length} total
              </div>
              {report.signals.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                  No signals detected for this account.
                </div>
              ) : (
                <SignalTimeline signals={report.signals} />
              )}
            </div>
            <SignalScoreCard score={report.signal_score} />
          </div>
        </div>
      </div>
    </>
  );
}

function SignalRow({ report, onClick }: { report: SignalReport; onClick: () => void }) {
  const domain = report.account_domain;
  const initial = domain[0]?.toUpperCase() ?? "?";
  return (
    <tr
      onClick={onClick}
      style={{ borderBottom: "1px solid rgba(228,230,242,0.6)", transition: "background 0.1s", cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ink-50)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td style={{ padding: "13px 20px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: logoColor(domain), color: "white", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>{initial}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{domain}</div>
            <div style={{ fontSize: 10, color: "var(--text-mute)", fontFamily: "var(--font-mono)", marginTop: 1 }}>{report.signals.length} signal{report.signals.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: "13px 20px" }}>
        <span className={`tier-badge tier-${report.tier.replace("TIER_", "T")}`}>
          {report.tier.replace("_", " ")}
        </span>
      </td>
      <td style={{ padding: "13px 20px" }}>
        <IntentBar score={report.signal_score.total_score} max={80} />
      </td>
      <td style={{ padding: "13px 20px" }}>
        <span className={`stage-badge stage-${report.buying_stage}`}>
          {STAGE_ICON[report.buying_stage] ?? "•"}{" "}
          {STAGE_LABEL[report.buying_stage] ?? report.buying_stage}
        </span>
      </td>
      <td style={{ padding: "13px 20px", color: "var(--text-2)", fontSize: 12.5 }}>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {report.signals.slice(0, 2).map((s) => s.description).join(" · ") || <span style={{ color: "var(--text-mute)" }}>No active signals</span>}
        </span>
      </td>
    </tr>
  );
}

export function SignalsPage() {
  const [params] = useSearchParams();
  const clientId  = params.get("client_id") || getActiveClientId();
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [drawerReport, setDrawerReport] = useState<SignalReport | null>(null);

  const accountsQuery = useAccounts({ clientId, filters: { tier: "ALL", minScore: 0, maxScore: 100, search: "", sources: [] }, pageSize: 100 });
  const accounts = accountsQuery.data?.accounts ?? [];

  const query    = useSignalsByClient(clientId);
  const discover   = useDiscoverSignals();
  const cancel     = useCancelSignals();
  const runStatus  = useSignalRunStatus(clientId ?? undefined);
  const isRunning  = runStatus.data?.is_running || discover.isPending;
  const allReports = (Object.values(query.data ?? {}) as SignalReport[]).sort(
    (a, b) => b.signal_score.total_score - a.signal_score.total_score,
  );

  const reports = selectedDomain
    ? allReports.filter((r) => r.account_domain === selectedDomain)
    : allReports;

  const highIntent  = reports.filter((r) => r.signal_score.high_count > 0).length;
  const evaluating  = reports.filter((r) => r.buying_stage === "EVALUATING" || r.buying_stage === "READY_TO_BUY").length;
  const intentScore = reports.length > 0
    ? Math.round(reports.reduce((sum, r) => sum + r.signal_score.total_score, 0) / reports.length)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", minWidth: 0 }}>
      {/* ── Page Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Signal & Intelligence</div>
          <h1 className="ph-title">Read Intent Before First Touch</h1>
          <p className="ph-subtitle">
            Pull account signals, understand buying stage, and surface the strategic context that should shape every outreach message.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Accounts</div>
            <div className="ph-kpi-num">{allReports.length}</div>
          </div>
          <div className="ph-kpi" data-tone="red">
            <div className="ph-kpi-label">High Intent</div>
            <div className="ph-kpi-num">{highIntent}</div>
          </div>
          <div className="ph-kpi" data-tone="amber">
            <div className="ph-kpi-label">Evaluating</div>
            <div className="ph-kpi-num">{evaluating}</div>
          </div>
          <div className="ph-kpi" data-tone="green">
            <div className="ph-kpi-label">Avg Score</div>
            <div className="ph-kpi-num">{intentScore}</div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="ph-actions">
        <select
          className="ph-select"
          value={selectedDomain}
          onChange={(e) => setSelectedDomain(e.target.value)}
          style={{ minWidth: 260 }}
        >
          <option value="">All accounts ({allReports.length} with signals)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.domain}>{a.company_name} — {a.domain}</option>
          ))}
        </select>
        {selectedDomain && (
          <button className="btn btn-sm" onClick={() => setSelectedDomain("")}>✕ Clear filter</button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {isRunning && (
            <button
              className="btn btn-sm"
              data-variant="danger"
              onClick={() => cancel.mutate(clientId!)}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? "Cancelling…" : "✕ Cancel run"}
            </button>
          )}
          <button
            className="btn btn-sm"
            data-variant="accent"
            onClick={() => discover.mutate(clientId!)}
            disabled={isRunning}
          >
            {isRunning ? "Discovering…" : "⟳ Refresh signals"}
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {query.isLoading ? (
        <div style={{ minHeight: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner size="lg" label="Loading signals" />
        </div>
      ) : query.isError || reports.length === 0 ? (
        <div style={{ padding: 24 }}>
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <div className="empty-title">No signals yet</div>
            <div className="empty-sub">
              Run Signal Discovery to analyse buying intent across your accounts. Use the company filter above to focus on a single account.
            </div>
            <button
              className="btn"
              data-variant="accent"
              onClick={() => discover.mutate(clientId)}
              disabled={discover.isPending}
              style={{ margin: "0 auto" }}
            >
              {discover.isPending ? "Discovering…" : "Run Signal Discovery"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ width: "100%", background: "var(--surface)", borderTop: "1px solid var(--border)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", fontSize: 13.5 }}>
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "31%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                {["Account", "Tier", "Intent Score", "Buying Stage", "Top Signals"].map((h) => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-mute)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", background: "var(--surface-2)", position: "sticky", top: 0, zIndex: 2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => <SignalRow key={r.account_domain} report={r} onClick={() => setDrawerReport(r)} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Signal detail drawer ── */}
      {drawerReport && (
        <SignalDrawer report={drawerReport} onClose={() => setDrawerReport(null)} />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </div>
  );
}
