// External 404/410 surface. Helpful copy, no raw JSON (master prompt §9).

export default function ExpiredView() {
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
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>
          This handoff link is no longer active
        </h1>
        <p style={{ marginTop: 12, color: "#475569", lineHeight: 1.55, fontSize: 15 }}>
          It may have expired, been completed, or returned to the team for follow-up.
          Please contact your operator if you believe this is in error.
        </p>
      </div>
    </main>
  );
}
