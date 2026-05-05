import { useState } from "react";

interface Props {
  defaultName?: string;
  isPending: boolean;
  errorMessage?: string | null;
  onConfirm: (acceptedBy: string) => void;
  onCancel: () => void;
}

// Simple bottom-sheet style; mobile-first; tap target >= 44px on action row.
export default function AcceptModal({ defaultName = "", isPending, errorMessage, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Accept lead"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 60,
        display: "grid",
        alignItems: "end",
        justifyItems: "center",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "white",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: "20px 18px 22px",
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Accept this lead</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
          Please confirm your name. The operator team uses this for the audit trail.
        </p>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#334155" }}>
          Your name or email
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="alex@fcp.test"
            autoFocus
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "12px 12px",
              fontSize: 16,
              minHeight: 44,
            }}
          />
        </label>
        {errorMessage ? (
          <div style={{ fontSize: 13, color: "#b91c1c" }}>{errorMessage}</div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
          <button
            onClick={onCancel}
            disabled={isPending}
            style={{
              minHeight: 44,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "white",
              color: "#0f172a",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(trimmed)}
            disabled={isPending || trimmed.length === 0}
            style={{
              minHeight: 44,
              borderRadius: 8,
              border: "none",
              background: trimmed.length === 0 || isPending ? "#94a3b8" : "#0f172a",
              color: "white",
              fontWeight: 700,
              fontSize: 15,
              cursor: trimmed.length === 0 || isPending ? "not-allowed" : "pointer",
            }}
          >
            {isPending ? "Accepting…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
