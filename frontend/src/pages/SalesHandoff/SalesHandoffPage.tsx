import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import AcceptModal from "./AcceptModal";
import AcceptedView from "./AcceptedView";
import DeclineModal from "./DeclineModal";
import ExpiredView from "./ExpiredView";
import { useAcceptSalesHandoff, useRejectSalesHandoff, useSalesHandoff, useSlaCountdown } from "./hooks";
import type { HandoffTriggerEventType } from "./types";

const TRIGGER_LABEL: Record<HandoffTriggerEventType, string> = {
  EMAIL_REPLY: "Email reply",
  LINKEDIN_DM_REPLY: "LinkedIn DM reply",
  WHATSAPP_REPLY: "WhatsApp reply",
  MEETING_BOOKED: "Meeting booked",
};

const URGENCY_COLOR = {
  fresh: { bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" },
  warn: { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" },
  critical: { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
  overdue: { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
} as const;

function formatRemaining(hoursRemaining: number, urgency: ReturnType<typeof useSlaCountdown>["urgency"]): string {
  if (urgency === "overdue") return "Overdue";
  if (hoursRemaining < 1) {
    const mins = Math.max(0, Math.round(hoursRemaining * 60));
    return `${mins}m remaining`;
  }
  return `${Math.floor(hoursRemaining)}h remaining`;
}

export default function SalesHandoffPage() {
  const { token } = useParams();
  const query = useSalesHandoff(token);
  const accept = useAcceptSalesHandoff(token || "");
  const reject = useRejectSalesHandoff(token || "");
  const [showAccept, setShowAccept] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [copied, setCopied] = useState(false);

  const data = query.data;
  const sla = useSlaCountdown(data?.notify_sent_at ?? null, data?.sla_hours ?? 24);

  const triggerLines = useMemo(() => {
    if (!data) return [];
    return data.triggering_events.map((evt, idx) => ({
      key: `${evt.event_type}-${idx}`,
      label: TRIGGER_LABEL[evt.event_type] ?? evt.event_type,
      when: new Date(evt.occurred_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    }));
  }, [data]);

  if (query.isLoading) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
        <LoadingSpinner size="lg" label="Loading handoff" />
      </main>
    );
  }

  if (query.isError || !data) {
    return <ExpiredView />;
  }

  // Terminal states get their own surface — no action bar.
  if (data.status === "ACCEPTED") return <AcceptedView handoff={data} />;
  if (data.status === "REJECTED" || data.status === "ESCALATED") return <ExpiredView />;

  const urgencyStyle = URGENCY_COLOR[sla.urgency];
  const overdue = sla.urgency === "overdue";

  function copyMeetingLink() {
    if (!data?.meeting_link) return;
    navigator.clipboard.writeText(data.meeting_link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      // Clipboard API can fail on insecure contexts; fail silently.
    });
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "grid",
        gridTemplateRows: "1fr auto",
      }}
    >
      <div style={{ padding: "20px 16px 140px", maxWidth: 540, margin: "0 auto", width: "100%" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: "#64748b", textTransform: "uppercase" }}>
          New lead for you
        </div>
        <h1 style={{ margin: "6px 0 4px", fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
          {data.contact_display_name}
        </h1>
        <div style={{ fontSize: 15, color: "#334155" }}>
          {data.contact_title ? `${data.contact_title} · ` : ""}
          {data.account_display_name}
        </div>

        <div
          data-testid="sla-badge"
          style={{
            marginTop: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 999,
            background: urgencyStyle.bg,
            color: urgencyStyle.fg,
            border: `1px solid ${urgencyStyle.border}`,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {overdue ? "⏱" : "⏱"} {formatRemaining(sla.hoursRemaining, sla.urgency)}
        </div>

        <section
          aria-labelledby="why-heading"
          style={{
            marginTop: 22,
            background: "white",
            borderRadius: 12,
            padding: "16px 16px 18px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <h2 id="why-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            Why now
          </h2>
          <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {triggerLines.map((line) => (
              <li key={line.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#334155" }}>
                <span>{line.label}</span>
                <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{line.when}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="summary-heading"
          style={{
            marginTop: 14,
            background: "white",
            borderRadius: 12,
            padding: "16px 16px 18px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <h2 id="summary-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            Summary
          </h2>
          <p
            style={{
              margin: "10px 0 0",
              whiteSpace: "pre-wrap",
              fontSize: 15,
              lineHeight: 1.55,
              color: "#0f172a",
            }}
          >
            {/* Strip the [CP4 Handoff] header line — internal terminology (master prompt §1). */}
            {data.tldr_text.split("\n").filter((line) => !line.startsWith("[CP4 Handoff]")).join("\n").trim()}
          </p>
        </section>

        {data.meeting_link ? (
          <section
            style={{
              marginTop: 14,
              background: "white",
              borderRadius: 12,
              padding: "16px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Meeting link</div>
            <div style={{ fontSize: 14, color: "#334155", wordBreak: "break-all" }}>{data.meeting_link}</div>
            <button
              onClick={copyMeetingLink}
              aria-label="Copy meeting link"
              style={{
                minHeight: 44,
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "white",
                color: "#0f172a",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </section>
        ) : null}
      </div>

      {/* Sticky bottom action bar — primary action large, decline smaller. */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "white",
          borderTop: "1px solid #e2e8f0",
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: 10,
          boxShadow: "0 -2px 12px rgba(0,0,0,0.06)",
        }}
      >
        <button
          onClick={() => setShowDecline(true)}
          aria-label="Decline lead"
          style={{
            minHeight: 48,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            background: "white",
            color: "#0f172a",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Decline
        </button>
        <button
          onClick={() => setShowAccept(true)}
          aria-label="Accept lead"
          style={{
            minHeight: 48,
            borderRadius: 10,
            border: "none",
            background: "#0f172a",
            color: "white",
            fontWeight: 800,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Accept lead
        </button>
      </div>

      {showAccept ? (
        <AcceptModal
          isPending={accept.isPending}
          errorMessage={accept.error ? "Could not accept — please try again." : null}
          onCancel={() => setShowAccept(false)}
          onConfirm={(name) => {
            accept.mutate(name, {
              onSuccess: () => setShowAccept(false),
            });
          }}
        />
      ) : null}

      {showDecline ? (
        <DeclineModal
          isPending={reject.isPending}
          errorMessage={reject.error ? "Could not submit — please try again." : null}
          onCancel={() => setShowDecline(false)}
          onConfirm={(reason) => {
            reject.mutate(reason, {
              onSuccess: () => setShowDecline(false),
            });
          }}
        />
      ) : null}
    </main>
  );
}
