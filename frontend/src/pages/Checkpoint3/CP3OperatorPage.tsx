import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Btn from "@/components/ui/Btn";
import BuyerView from "./BuyerView";
import ClientFeedbackPanel from "./ClientFeedbackPanel";
import CP3ApprovalFooter from "./CP3ApprovalFooter";
import MessageView from "./MessageView";
import SendToClientPanel from "./SendToClientPanel";
import { getActiveClientId } from "@/lib/session";
import {
  type CP3Filters,
  type MessageReviewDecision,
} from "./types";
import {
  useApproveBuyer,
  useApproveCP3,
  useCP3State,
  useMarkOperatorComplete,
  useMessageOpened,
  useResolveFeedback,
  useReviewMessage,
  useSendToClient,
} from "./hooks";

// ── Workflow stages ───────────────────────────────────────────────────────────

const FLOW_STAGES = [
  {
    key: "OPERATOR_REVIEW",
    label: "You review messages",
    icon: "🔍",
    desc: "Read every AI-written message, approve, edit, or request regeneration.",
  },
  {
    key: "CLIENT_REVIEW",
    label: "Client reviews samples",
    icon: "📨",
    desc: "Send 5 curated sample messages to the client for their sign-off.",
  },
  {
    key: "CHANGES_REQUESTED",
    label: "Address feedback",
    icon: "✏️",
    desc: "Resolve any change requests the client left on the samples.",
  },
  {
    key: "APPROVED",
    label: "CP3 approved",
    icon: "🚀",
    desc: "Campaign Agent is unlocked — messages will be dispatched.",
  },
];

const STATUS_ORDER = ["NOT_STARTED", "OPERATOR_REVIEW", "CLIENT_REVIEW", "CHANGES_REQUESTED", "APPROVED"];

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  NOT_STARTED:       { color: "var(--text-3)",   bg: "var(--surface-3)", border: "var(--border)",     label: "Not Started" },
  OPERATOR_REVIEW:   { color: "var(--warn-500)", bg: "rgba(255,215,0,0.08)",  border: "rgba(255,215,0,0.25)",  label: "Operator Review" },
  CLIENT_REVIEW:     { color: "var(--acc-300)",  bg: "rgba(0,212,255,0.08)", border: "rgba(0,212,255,0.25)", label: "Client Review" },
  CHANGES_REQUESTED: { color: "var(--bad-500)",  bg: "rgba(255,70,70,0.08)", border: "rgba(255,70,70,0.25)", label: "Changes Requested" },
  APPROVED:          { color: "var(--good-500)", bg: "rgba(0,255,150,0.08)", border: "rgba(0,255,150,0.25)", label: "Approved ✓" },
  REJECTED:          { color: "var(--bad-500)",  bg: "rgba(255,70,70,0.08)", border: "rgba(255,70,70,0.25)", label: "Rejected" },
};

// ── How it works panel ────────────────────────────────────────────────────────

function HowItWorksPanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #f0f4ff 0%, #fafbff 100%)",
      border: "1px solid #c7d4f8", borderRadius: 14, padding: "20px 24px",
      display: "flex", flexDirection: "column", gap: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4f6ef7", marginBottom: 4 }}>
            What is this page?
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>
            You're reviewing the AI-written outreach before it reaches any prospect
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5, maxWidth: 640 }}>
            Storyteller has written personalised messages for every approved buyer — one per channel (Email, LinkedIn, WhatsApp etc.).
            Before a single message is sent, <strong>you read and approve them here</strong>, then share samples with the client for their sign-off.
          </div>
        </div>
        <button onClick={onDismiss} style={{ fontSize: 16, background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4, flexShrink: 0 }}>✕</button>
      </div>

      {/* 4-step flow */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {FLOW_STAGES.map((stage, i) => (
          <div key={stage.key} style={{
            background: "#fff", border: "1px solid #dde5fb", borderRadius: 10,
            padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: "linear-gradient(135deg, #4f6ef7, #7c3aed)",
                color: "#fff", fontSize: 11, fontWeight: 800,
                display: "grid", placeItems: "center", flexShrink: 0,
              }}>{i + 1}</div>
              <span style={{ fontSize: 14 }}>{stage.icon}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{stage.label}</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>{stage.desc}</div>
          </div>
        ))}
      </div>

      {/* Validation glossary */}
      <div style={{
        background: "#fff", border: "1px solid #dde5fb", borderRadius: 10,
        padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>
          🏷 What do the validation badges mean?
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "var(--bad-50)", color: "var(--bad-700)", border: "1px solid var(--bad-100)" }}>Hard Fail</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.4 }}>
              A personalisation claim in this message <strong>can't be traced</strong> back to any verified source. It may be hallucinated. <strong>Edit or regenerate before approving.</strong>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "var(--warn-50)", color: "var(--warn-700)", border: "1px solid var(--warn-100)" }}>Soft Fail</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.4 }}>
              A claim is only weakly sourced — it might be right, but it's not fully verified. Review the wording carefully before approving.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "var(--warn-50)", color: "var(--warn-700)", border: "1px solid var(--warn-100)" }}>Collision</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.4 }}>
              This message's personalisation hook is too similar to another message. If both go out, the prospect won't feel individually targeted. Regenerate one of them.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "var(--good-50)", color: "var(--good-700)", border: "1px solid var(--good-100)" }}>Traced ✓</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.4 }}>
              Every claim in this message links back to a verified source (signal data, intel report, or CP2-approved claim). Safe to approve.
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onDismiss}
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

// ── Status + progress card ────────────────────────────────────────────────────

function StatusCard({
  state,
  quality,
}: {
  state: import("./types").CP3ReviewState;
  quality: { hard: number; soft: number; diversity: number };
}) {
  const st = STATUS_STYLE[state.status] ?? STATUS_STYLE.OPERATOR_REVIEW;
  const p = state.aggregate_progress;
  const reviewedPct = p.total_messages ? Math.round((p.reviewed_messages / p.total_messages) * 100) : 0;
  const buyersPct = p.total_buyers ? Math.round((p.approved_buyers / p.total_buyers) * 100) : 0;
  const activeIdx = STATUS_ORDER.indexOf(state.status);

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14,
    }}>
      {/* Status + flow bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
            background: st.bg, color: st.color, border: `1px solid ${st.border}`,
          }}>
            {st.label}
          </span>
          {state.reviewer && (
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              {state.reviewer}
              {state.opened_at && ` · opened ${new Date(state.opened_at).toLocaleDateString()}`}
            </span>
          )}
        </div>

        {/* Validation issue summary */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {quality.hard > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--bad-50)", color: "var(--bad-700)", border: "1px solid var(--bad-100)" }}>
              ⚠ {quality.hard} Hard Fail{quality.hard !== 1 ? "s" : ""}
            </span>
          )}
          {quality.soft > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--warn-50)", color: "var(--warn-700)", border: "1px solid var(--warn-100)" }}>
              {quality.soft} Soft Fail{quality.soft !== 1 ? "s" : ""}
            </span>
          )}
          {quality.diversity > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--warn-50)", color: "var(--warn-700)", border: "1px solid var(--warn-100)" }}>
              {quality.diversity} Collision{quality.diversity !== 1 ? "s" : ""}
            </span>
          )}
          {quality.hard === 0 && quality.soft === 0 && quality.diversity === 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--good-50)", color: "var(--good-700)", border: "1px solid var(--good-100)" }}>
              ✓ No validation issues
            </span>
          )}
        </div>
      </div>

      {/* Flow progress strip */}
      <div style={{ display: "flex", gap: 4 }}>
        {FLOW_STAGES.map((stage, idx) => {
          const isActive = stage.key === state.status;
          const isPast = idx < activeIdx - 1; // -1 because NOT_STARTED is idx 0
          return (
            <div key={stage.key} style={{ flex: 1 }}>
              <div style={{
                height: 6, borderRadius: 4,
                background: isActive ? "#4f6ef7" : isPast ? "#4f6ef755" : "var(--border)",
                transition: "background 0.3s",
              }} />
              <div style={{ fontSize: 9, marginTop: 3, fontWeight: isActive ? 700 : 400, color: isActive ? "#4f6ef7" : "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {stage.icon} {stage.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)" }}>
              Step 1 — Messages reviewed
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: reviewedPct === 100 ? "var(--good-700)" : "var(--text-2)" }}>{reviewedPct}%</span>
          </div>
          <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 999, width: `${reviewedPct}%`,
              background: reviewedPct === 100 ? "var(--good-500)" : "var(--acc-500)",
              transition: "width 0.4s ease",
            }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
            {p.reviewed_messages} of {p.total_messages} · {p.approved_messages} approved, {p.edited_messages} edited, {p.regenerated_messages} regenerated
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)" }}>
              Step 2 — Buyers approved
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: buyersPct === 100 ? "var(--good-700)" : "var(--text-2)" }}>{buyersPct}%</span>
          </div>
          <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 999, width: `${buyersPct}%`,
              background: buyersPct === 100 ? "var(--good-500)" : "var(--acc-300)",
              transition: "width 0.4s ease",
            }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
            {p.approved_buyers} of {p.total_buyers} buyers approved
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({
  view, setView, pendingMessages, pendingBuyers,
}: {
  view: "message" | "buyer";
  setView: (v: "message" | "buyer") => void;
  pendingMessages: number;
  pendingBuyers: number;
}) {
  return (
    <div style={{ display: "flex", gap: 2, padding: "3px", background: "var(--surface-3)", borderRadius: 10, width: "fit-content" }}>
      <button
        type="button"
        onClick={() => setView("message")}
        style={{
          padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
          fontWeight: 600, fontSize: 13,
          background: view === "message" ? "var(--surface)" : "transparent",
          color: view === "message" ? "var(--text)" : "var(--text-3)",
          boxShadow: view === "message" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          transition: "all 0.15s",
          display: "flex", alignItems: "center", gap: 7,
        }}
      >
        <span>✉️</span>
        <span>Review Messages</span>
        {pendingMessages > 0 && (
          <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: "#fde68a", color: "#92400e" }}>
            {pendingMessages}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setView("buyer")}
        style={{
          padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
          fontWeight: 600, fontSize: 13,
          background: view === "buyer" ? "var(--surface)" : "transparent",
          color: view === "buyer" ? "var(--text)" : "var(--text-3)",
          boxShadow: view === "buyer" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          transition: "all 0.15s",
          display: "flex", alignItems: "center", gap: 7,
        }}
      >
        <span>👤</span>
        <span>Approve Buyers</span>
        {pendingBuyers > 0 && (
          <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-3)" }}>
            {pendingBuyers} left
          </span>
        )}
      </button>
    </div>
  );
}

// ── Tab hints ─────────────────────────────────────────────────────────────────

function TabHint({ view }: { view: "message" | "buyer" }) {
  if (view === "message") return (
    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 16px", fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
      <strong>Step 1 of 4.</strong> Read each message the AI wrote. For each one:{" "}
      <strong>Approve</strong> it if it's good to go ·{" "}
      <strong>Edit</strong> if the wording needs a tweak ·{" "}
      <strong>Regenerate</strong> if it needs a full rewrite ·{" "}
      <strong>Reject</strong> if it shouldn't be sent at all.
      Messages with <span style={{ color: "var(--bad-700)", fontWeight: 700 }}>Hard Fail</span> badges need attention before approval.
      Once all messages for a buyer are reviewed, switch to <strong>Approve Buyers</strong>.
    </div>
  );
  return (
    <div style={{ background: "rgba(0,255,150,0.07)", border: "1px solid rgba(0,255,150,0.22)", borderRadius: 10, padding: "10px 16px", fontSize: 12, color: "var(--good-500)", lineHeight: 1.5 }}>
      <strong>Step 2 of 4.</strong> Approve each buyer once all their messages are reviewed.
      This confirms the whole message set for that person is ready.
      When all buyers are approved, click <strong>Mark Operator Review Complete</strong> at the bottom,
      then send a sample to the client for their sign-off.
    </div>
  );
}

// ── Default filters ───────────────────────────────────────────────────────────

const defaultFilters: CP3Filters = {
  channel: "ALL",
  tier: "ALL",
  validation: "ALL",
  reviewState: "ALL",
  issuesOnly: false,
  contactId: null,
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CP3OperatorPage() {
  const [params] = useSearchParams();
  const clientId = params.get("client_id") || getActiveClientId();
  const [view, setView] = useState<"message" | "buyer">("message");
  const [filters, setFilters] = useState<CP3Filters>(defaultFilters);
  const [shareUrl, setShareUrl] = useState<string | undefined>();
  const [howDismissed, setHowDismissed] = useState(false);

  const query = useCP3State(clientId);
  const reviewMessage = useReviewMessage(clientId);
  const opened = useMessageOpened(clientId);
  const approveBuyer = useApproveBuyer(clientId);
  const complete = useMarkOperatorComplete(clientId);
  const sendToClient = useSendToClient(clientId);
  const resolveFeedback = useResolveFeedback(clientId);
  const approveCP3 = useApproveCP3(clientId);

  const state = query.data;

  const quality = useMemo(() => {
    const messages = state?.messages || [];
    return {
      hard:      messages.filter((m) => m.validation_state.traceability === "HARD_FAIL").length,
      soft:      messages.filter((m) => m.validation_state.traceability === "SOFT_FAIL").length,
      diversity: messages.filter((m) => m.validation_state.diversity === "FAILED").length,
    };
  }, [state?.messages]);

  const pendingMessages = useMemo(() => {
    if (!state) return 0;
    return state.message_reviews.filter((r) => r.review_decision === "PENDING").length;
  }, [state?.message_reviews]);

  const pendingBuyers = useMemo(() => {
    if (!state) return 0;
    return state.buyer_approvals.filter((b) => b.buyer_decision === "PENDING").length;
  }, [state?.buyer_approvals]);

  if (query.isLoading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading CP3 review" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page-body">
        <div style={{
          background: "var(--surface)", border: "1.5px dashed var(--border-strong)",
          borderRadius: 14, padding: "60px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✍️</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 8 }}>
            No messages to review yet
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            Storyteller needs to run first — it writes the outreach messages you'll review here.
            Make sure CP2 is approved, then run the Storyteller agent.
          </div>
        </div>
      </div>
    );
  }

  const onReview = (
    messageId: string,
    decision: MessageReviewDecision,
    edits?: { layer: string; before: string; after: string }[],
    notes?: string,
  ) => {
    reviewMessage.mutate({ messageId, decision, edits, reviewNotes: notes });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Operator Review · Phase 5</div>
          <h1 className="ph-title">Review Outreach Messages</h1>
          <p className="ph-subtitle">
            Read and approve AI-written messages before they reach any prospect. Fix what needs fixing, then send samples to the client for sign-off.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Messages</div>
            <div className="ph-kpi-num">{state.aggregate_progress.total_messages}</div>
          </div>
          <div className="ph-kpi" data-tone={pendingMessages === 0 ? "green" : "amber"}>
            <div className="ph-kpi-label">Pending review</div>
            <div className="ph-kpi-num">{pendingMessages}</div>
          </div>
          <div className="ph-kpi" data-tone={quality.hard > 0 ? "red" : quality.soft > 0 ? "amber" : "green"}>
            <div className="ph-kpi-label">Issues</div>
            <div className="ph-kpi-num">{quality.hard + quality.soft + quality.diversity}</div>
          </div>
          <div className="ph-kpi" data-tone={state.aggregate_progress.approved_buyers > 0 ? "green" : undefined}>
            <div className="ph-kpi-label">Buyers approved</div>
            <div className="ph-kpi-num">
              {state.aggregate_progress.approved_buyers}
              <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.5 }}>/{state.aggregate_progress.total_buyers}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── How it works ── */}
        {!howDismissed && state.status !== "APPROVED" && (
          <HowItWorksPanel onDismiss={() => setHowDismissed(true)} />
        )}

        {/* ── Status + progress ── */}
        <StatusCard state={state} quality={quality} />

        {/* ── Contact filter banner ── */}
        {filters.contactId && (
          <div style={{
            background: "rgba(0,212,255,0.07)", border: "1px solid rgba(0,212,255,0.20)", borderRadius: 10,
            padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--acc-300)" }}>Filtered to one buyer — </span>
              <span style={{ fontSize: 12, color: "var(--acc-300)", fontFamily: "var(--font-mono)" }}>{filters.contactId}</span>
            </div>
            <Btn size="sm" variant="ghost" onClick={() => setFilters({ ...filters, contactId: null })}>Clear filter</Btn>
          </div>
        )}

        {/* ── Tabs ── */}
        <TabBar
          view={view}
          setView={setView}
          pendingMessages={pendingMessages}
          pendingBuyers={pendingBuyers}
        />

        {/* ── Tab hint ── */}
        {state.status !== "APPROVED" && <TabHint view={view} />}

        {/* ── Tab content ── */}
        {view === "message" ? (
          <MessageView
            state={state}
            filters={filters}
            setFilters={setFilters}
            onReview={onReview}
            onOpened={(messageId) => opened.mutate(messageId)}
            onRegenerate={(messageId, reason) =>
              reviewMessage.mutate({ messageId, decision: "REGENERATED", reviewNotes: reason })
            }
          />
        ) : (
          <BuyerView
            state={state}
            setFilters={(next) => { setFilters(next); setView("message"); }}
            onApproveBuyer={(contactId) => approveBuyer.mutate({ contactId })}
          />
        )}

        {/* ── Send to client (shown when operator review is complete) ── */}
        <SendToClientPanel
          state={state}
          shareUrl={shareUrl}
          onSend={(email, sampleIds) =>
            sendToClient.mutate(
              { clientEmail: email, sampleMessageIds: sampleIds },
              { onSuccess: (data) => setShareUrl(data.share_url) },
            )
          }
        />

        {/* ── Client feedback ── */}
        <ClientFeedbackPanel
          state={state}
          onResolve={(feedbackId, resolutionNotes) =>
            resolveFeedback.mutate({ feedbackId, resolutionNotes })
          }
        />

      </div>

      {/* ── Sticky footer ── */}
      <CP3ApprovalFooter
        state={state}
        onOperatorComplete={() => complete.mutate()}
        onApproveCP3={() => approveCP3.mutate()}
      />
    </div>
  );
}
