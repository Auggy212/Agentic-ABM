import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import BulkView from "./BulkView";
import CP2ApprovalFooter from "./CP2ApprovalFooter";
import PerClaimView from "./PerClaimView";
import { getActiveClientId } from "@/lib/session";
import { useCP2State } from "./hooks";

// ── Step guide ────────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: "1",
    title: "Review AI-inferred claims",
    desc: "The AI read your buyers' profiles and company intel, then made educated guesses about each account's pain points and priorities. Your job: check whether those guesses are accurate.",
    tab: "per-claim" as const,
    icon: "🔍",
  },
  {
    num: "2",
    title: "Approve or remove accounts",
    desc: "Once all claims for an account are decided, approve it to keep it in the pipeline — or remove it if it's not a good fit.",
    tab: "bulk" as const,
    icon: "✅",
  },
  {
    num: "3",
    title: "Approve Checkpoint 2",
    desc: "When every account is reviewed, hit Approve CP2 at the bottom. This unlocks Storyteller, which will use your approved claims to write personalised outreach.",
    tab: null,
    icon: "🚀",
  },
];

function HowItWorksPanel({ onStart }: { onStart: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #f0f4ff 0%, #fafbff 100%)",
      border: "1px solid #c7d4f8",
      borderRadius: 14, padding: "20px 24px",
      display: "flex", flexDirection: "column", gap: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4f6ef7", marginBottom: 4 }}>
            What is this page?
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>
            You're the quality gate before outreach is written
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5, maxWidth: 620 }}>
            The AI has analysed your target accounts and made inferences about their pain points, strategic priorities, and competitive situation. Before those assumptions get baked into your outreach messages, <strong>you review and approve them here.</strong>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} style={{ fontSize: 16, background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4, flexShrink: 0 }}>✕</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {STEPS.map((step) => (
          <div key={step.num} style={{
            background: "#fff", border: "1px solid #dde5fb", borderRadius: 10,
            padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: "linear-gradient(135deg, #4f6ef7, #7c3aed)",
                color: "#fff", fontSize: 12, fontWeight: 800,
                display: "grid", placeItems: "center", flexShrink: 0,
              }}>{step.num}</div>
              <span style={{ fontSize: 14 }}>{step.icon}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{step.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>{step.desc}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => { setDismissed(true); onStart(); }}
        style={{
          alignSelf: "flex-start", padding: "9px 22px", borderRadius: 9,
          background: "linear-gradient(135deg, #4f6ef7, #7c3aed)",
          color: "#fff", fontSize: 13, fontWeight: 700,
          border: "none", cursor: "pointer",
          boxShadow: "0 3px 12px rgba(79,110,247,0.3)",
        }}
      >
        Got it — start reviewing →
      </button>
    </div>
  );
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string; border: string; desc: string }> = {
  NOT_STARTED: { label: "Not Started",  bg: "var(--surface-3)", fg: "var(--text-3)",   border: "var(--border)",     desc: "No one has opened this review yet." },
  IN_REVIEW:   { label: "In Review",    bg: "#fef3c7",          fg: "#92400e",         border: "#fde68a",           desc: "Review is in progress." },
  APPROVED:    { label: "Approved ✓",   bg: "var(--good-50)",   fg: "var(--good-700)", border: "var(--good-100)",   desc: "All claims reviewed and accounts approved." },
  REJECTED:    { label: "Rejected",     bg: "var(--bad-50)",    fg: "var(--bad-700)",  border: "var(--bad-100)",    desc: "Review was rejected." },
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CP2ReviewPage() {
  const [params] = useSearchParams();
  const clientId = params.get("client_id") || getActiveClientId();
  const [tab, setTab] = useState<"per-claim" | "bulk">("per-claim");
  const query = useCP2State(clientId);

  if (query.isLoading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading Checkpoint 2" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="page-body">
        <div style={{
          background: "var(--surface)", border: "1.5px dashed var(--border-strong)",
          borderRadius: 14, padding: "60px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 8 }}>
            Nothing to review yet
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            Buyer Intel and Signal Intel need to run first — they're what produce the AI-inferred claims you'll review here.
            Head to <strong>Run Agents</strong> to kick those off.
          </div>
        </div>
      </div>
    );
  }

  const state = query.data;
  const p = state.aggregate_progress;
  const pending = p.total_inferred_claims - p.reviewed_claims;
  const claimsPct = p.total_inferred_claims ? Math.round((p.reviewed_claims / p.total_inferred_claims) * 100) : 0;
  const accountsPct = p.total_accounts ? Math.round((p.approved_accounts / p.total_accounts) * 100) : 0;
  const st = STATUS_CONFIG[state.status] ?? STATUS_CONFIG.IN_REVIEW;
  const isApproved = state.status === "APPROVED";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Quality Gate · Phase 4</div>
          <h1 className="ph-title">Review AI Claims</h1>
          <p className="ph-subtitle">
            Check the AI's assumptions about your accounts before they're used to write outreach. Approve what's right, fix what's off, remove what's wrong.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Claims to review</div>
            <div className="ph-kpi-num">{p.total_inferred_claims}</div>
          </div>
          <div className="ph-kpi" data-tone={claimsPct === 100 ? "green" : pending > 0 ? "amber" : undefined}>
            <div className="ph-kpi-label">Reviewed</div>
            <div className="ph-kpi-num">{p.reviewed_claims}<span style={{ fontSize: 14, fontWeight: 500, opacity: 0.5 }}>/{p.total_inferred_claims}</span></div>
          </div>
          <div className="ph-kpi" data-tone={accountsPct === 100 ? "green" : undefined}>
            <div className="ph-kpi-label">Accounts approved</div>
            <div className="ph-kpi-num">{p.approved_accounts}<span style={{ fontSize: 14, fontWeight: 500, opacity: 0.5 }}>/{p.total_accounts}</span></div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── How it works (dismissable) ── */}
        {!isApproved && <HowItWorksPanel onStart={() => setTab("per-claim")} />}

        {/* ── Status + progress ── */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                padding: "4px 12px", borderRadius: 999,
                background: st.bg, color: st.fg, border: `1px solid ${st.border}`,
                fontWeight: 700, fontSize: 12,
              }} data-testid="cp2-status-pill">
                {st.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>{st.desc}</span>
              {state.reviewer && (
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                  · {state.reviewer}
                  {state.opened_at && ` · opened ${new Date(state.opened_at).toLocaleDateString()}`}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: pending > 0 ? "#92400e" : "var(--good-700)", fontWeight: 700 }}>
              {pending > 0 ? `⚠ ${pending} claim${pending !== 1 ? "s" : ""} still need a decision` : "✓ All claims reviewed"}
            </div>
          </div>

          {/* Progress bars */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)" }}>Step 1 — Claims reviewed</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: claimsPct === 100 ? "var(--good-700)" : "var(--text-2)" }}>{claimsPct}%</span>
              </div>
              <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
                <div data-testid="claims-progress-bar" style={{
                  height: "100%", borderRadius: 999, width: `${claimsPct}%`,
                  background: claimsPct === 100 ? "var(--good-500)" : "var(--acc-500)",
                  transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                {p.reviewed_claims} of {p.total_inferred_claims} · {p.approved_claims} approved, {p.corrected_claims} corrected, {p.removed_claims} removed
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)" }}>Step 2 — Accounts approved</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: accountsPct === 100 ? "var(--good-700)" : "var(--text-2)" }}>{accountsPct}%</span>
              </div>
              <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
                <div data-testid="accounts-progress-bar" style={{
                  height: "100%", borderRadius: 999, width: `${accountsPct}%`,
                  background: accountsPct === 100 ? "var(--good-500)" : "#0ea5e9",
                  transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                {p.approved_accounts} of {p.total_accounts} accounts · {p.removed_accounts} removed from pipeline
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", gap: 2, padding: "3px", background: "var(--surface-3)", borderRadius: 10, width: "fit-content" }}>
          <button
            type="button"
            data-testid="tab-per-claim"
            onClick={() => setTab("per-claim")}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13,
              background: tab === "per-claim" ? "var(--surface)" : "transparent",
              color: tab === "per-claim" ? "var(--text)" : "var(--text-3)",
              boxShadow: tab === "per-claim" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 7,
            }}
          >
            <span>🔍</span>
            <span>Review Claims</span>
            {pending > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999,
                background: "#fde68a", color: "#92400e",
              }}>{pending}</span>
            )}
          </button>
          <button
            type="button"
            data-testid="tab-bulk"
            onClick={() => setTab("bulk")}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13,
              background: tab === "bulk" ? "var(--surface)" : "transparent",
              color: tab === "bulk" ? "var(--text)" : "var(--text-3)",
              boxShadow: tab === "bulk" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 7,
            }}
          >
            <span>✅</span>
            <span>Approve Accounts</span>
            <span style={{
              fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999,
              background: accountsPct === 100 ? "var(--good-100)" : "var(--surface-3)",
              color: accountsPct === 100 ? "var(--good-700)" : "var(--text-3)",
            }}>{p.approved_accounts}/{p.total_accounts}</span>
          </button>
        </div>

        {/* ── Tab hint ── */}
        {tab === "per-claim" && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a",
            borderRadius: 10, padding: "10px 16px",
            fontSize: 12, color: "#78350f", lineHeight: 1.5,
          }}>
            <strong>Step 1 of 3.</strong> Each card below is a claim the AI inferred about an account.
            For each one: <strong>Approve</strong> it if correct · <strong>Correct</strong> it if the wording is off · <strong>Remove</strong> it if it's wrong or irrelevant.
            Once all claims for an account are decided, switch to the <strong>Approve Accounts</strong> tab.
          </div>
        )}
        {tab === "bulk" && (
          <div style={{
            background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderRadius: 10, padding: "10px 16px",
            fontSize: 12, color: "#14532d", lineHeight: 1.5,
          }}>
            <strong>Step 2 of 3.</strong> Accounts unlock for approval once all their claims are reviewed.
            Approve accounts you want to keep in the pipeline — or remove ones that aren't a good fit.
            When done, hit <strong>Approve CP2</strong> at the bottom to unlock Storyteller.
          </div>
        )}

        {tab === "per-claim" ? (
          <PerClaimView clientId={clientId!} state={state} />
        ) : (
          <BulkView clientId={clientId!} state={state} />
        )}
      </div>

      <CP2ApprovalFooter clientId={clientId!} state={state} />
    </div>
  );
}
