import { useState } from "react";

interface Props {
  isPending: boolean;
  errorMessage?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

// Decline always requires a reason — operators need it to retarget or coach the
// pipeline. Submit disabled until reason has at least 5 non-whitespace chars.
const MIN_REASON_LEN = 5;

export default function DeclineModal({ isPending, errorMessage, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON_LEN;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Decline lead"
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
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Decline this lead</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
          Tell the operator team why so they can retarget. This goes in the audit trail.
        </p>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#334155" }}>
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Wrong-fit account, already in pipeline, no budget, …"
            autoFocus
            rows={4}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 15,
              minHeight: 88,
              resize: "vertical",
              fontFamily: "inherit",
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
            disabled={isPending || !valid}
            style={{
              minHeight: 44,
              borderRadius: 8,
              border: "none",
              background: !valid || isPending ? "#fca5a5" : "#b91c1c",
              color: "white",
              fontWeight: 700,
              fontSize: 15,
              cursor: !valid || isPending ? "not-allowed" : "pointer",
            }}
          >
            {isPending ? "Submitting…" : "Decline"}
          </button>
        </div>
      </div>
    </div>
  );
}
