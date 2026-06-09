import type { SalesHandoffPublic } from "./types";

interface Props {
  handoff: SalesHandoffPublic;
}

export default function AcceptedView({ handoff }: Props) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          background: "white",
          borderRadius: 12,
          padding: "28px 24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: "#dcfce7",
            color: "#166534",
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            marginBottom: 14,
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>
          Lead accepted
        </h1>
        <p style={{ marginTop: 10, color: "#475569", lineHeight: 1.55, fontSize: 15 }}>
          {handoff.contact_display_name} at {handoff.account_display_name} has been routed to your queue.
          You'll find the next steps in your CRM shortly.
        </p>
        {handoff.meeting_link ? (
          <a
            href={handoff.meeting_link}
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 8,
              background: "#0f172a",
              color: "white",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              minHeight: 44,
              lineHeight: "24px",
            }}
          >
            Open meeting link →
          </a>
        ) : null}
      </div>
    </main>
  );
}
