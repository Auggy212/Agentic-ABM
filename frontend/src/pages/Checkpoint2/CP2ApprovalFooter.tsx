import { useState } from "react";
import { useApproveCP2, useAutoApproveCP2, useResetCP2 } from "./hooks";
import type { CP2ReviewState } from "./types";

interface Props {
  clientId: string;
  state: CP2ReviewState;
}

export default function CP2ApprovalFooter({ clientId, state }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState(state.reviewer_notes ?? "");
  const approve = useApproveCP2(clientId);
  const autoApprove = useAutoApproveCP2(clientId);
  const reset = useResetCP2(clientId);

  const pending = state.aggregate_progress.total_inferred_claims - state.aggregate_progress.reviewed_claims;
  const blocked = state.blockers.length > 0 || pending > 0;
  const alreadyApproved = state.status === "APPROVED";

  if (alreadyApproved) {
    return (
      <div
        data-testid="cp2-approved-footer"
        style={{
          position: "sticky", bottom: 0, zIndex: 10,
          background: "var(--good-50)",
          borderTop: "1px solid var(--good-100)",
          padding: "14px 26px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--good-700)" }}>
            CP2 approved — Storyteller is unlocked.
          </span>
        </div>
        <button
          type="button"
          disabled={reset.isPending}
          onClick={() => {
            if (window.confirm("Re-open CP2? This will delete the current approval and re-aggregate claims from all current buyer profiles and signal reports.")) {
              reset.mutate();
            }
          }}
          style={{
            fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8,
            background: "transparent", color: "var(--good-700)",
            border: "1px solid var(--good-300)", cursor: reset.isPending ? "wait" : "pointer",
            opacity: reset.isPending ? 0.6 : 1,
          }}
        >
          {reset.isPending ? "Resetting…" : "Re-open & refresh"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: "sticky", bottom: 0, zIndex: 10,
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          padding: "14px 26px",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 20,
          alignItems: "start",
          boxShadow: "0 -6px 24px rgba(0,0,0,0.06)",
        }}
      >
        {/* Left: stats + notes */}
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              {state.aggregate_progress.reviewed_claims} / {state.aggregate_progress.total_inferred_claims} claims reviewed
            </span>
            {pending > 0 && (
              <span style={{
                fontSize: 12, fontWeight: 600,
                background: "rgba(255,215,0,0.10)", color: "var(--warn-500)",
                border: "1px solid rgba(255,215,0,0.28)",
                borderRadius: 999, padding: "1px 10px",
              }}>
                ⚠ {pending} pending
              </span>
            )}
          </div>

          {state.blockers.length > 0 && (
            <div data-testid="footer-blockers" style={{
              fontSize: 12, color: "var(--bad-700)",
              background: "var(--bad-50)", border: "1px solid var(--bad-100)",
              borderRadius: 8, padding: "6px 10px",
            }}>
              Blockers: {state.blockers.map((b) => b.message).join(" · ")}
            </div>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reviewer notes (optional)"
            rows={2}
            style={{
              padding: "8px 12px",
              border: "1.5px solid var(--border)",
              borderRadius: 8,
              fontSize: 13,
              maxWidth: 520,
              width: "100%",
              background: "var(--surface-2)",
              color: "var(--text)",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Right: buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <button
            type="button"
            data-testid="approve-cp2-btn"
            disabled={blocked}
            title={blocked ? "Review all claims and accounts before approving" : undefined}
            onClick={() => setConfirming(true)}
            style={{
              minWidth: 180, height: 52, fontSize: 15, fontWeight: 800,
              borderRadius: 12, border: "none", cursor: blocked ? "not-allowed" : "pointer",
              background: blocked
                ? "var(--surface-3)"
                : "linear-gradient(135deg, var(--acc-500), var(--acc-700))",
              color: blocked ? "var(--text-mute)" : "#fff",
              boxShadow: blocked ? "none" : "0 4px 14px rgba(0,212,255,0.35)",
              transition: "opacity 0.15s",
            }}
          >
            Approve CP2
          </button>
          <button
            type="button"
            data-testid="auto-approve-cp2-btn"
            disabled={autoApprove.isPending}
            onClick={() => {
              if (window.confirm(`Approve all ${state.aggregate_progress.total_inferred_claims - state.aggregate_progress.reviewed_claims} pending claims and all accounts, then approve CP2?`)) {
                autoApprove.mutate();
              }
            }}
            style={{
              minWidth: 180, height: 36, fontSize: 12, fontWeight: 600,
              borderRadius: 8, cursor: autoApprove.isPending ? "wait" : "pointer",
              background: "var(--surface-2)",
              color: "var(--text-2)",
              border: "1px solid var(--border)",
              opacity: autoApprove.isPending ? 0.6 : 1,
            }}
          >
            {autoApprove.isPending ? "Approving all…" : "Approve all & unlock"}
          </button>
        </div>
      </div>

      {/* ── Confirm modal ── */}
      {confirming && (
        <div
          data-testid="cp2-confirm-modal"
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(13,14,20,0.65)",
            backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
            animation: "abm-fade-in 0.15s ease",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirming(false); }}
        >
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 18, padding: "28px 32px",
            width: "100%", maxWidth: 520,
            display: "grid", gap: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--acc-500)", marginBottom: 6 }}>
                Confirm action
              </div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>
                Approve Checkpoint 2?
              </h2>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
              This will finalise the review and unlock the next phase. Specifically:
            </p>

            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--text-2)", lineHeight: 1.8 }}>
              <li>Lock all reviewed claims — further edits require re-opening CP2</li>
              <li>Unblock the Storyteller — it will begin drafting messages</li>
              <li>Remove flagged accounts from the pipeline permanently</li>
              <li>Notify the team</li>
            </ol>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{
                  fontSize: 13, fontWeight: 600, padding: "9px 20px", borderRadius: 10,
                  background: "var(--surface-2)", color: "var(--text-2)",
                  border: "1px solid var(--border)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="approve-cp2-confirm"
                disabled={approve.isPending}
                onClick={() =>
                  approve.mutate(
                    { reviewerNotes: notes || null },
                    { onSuccess: () => setConfirming(false) },
                  )
                }
                style={{
                  fontSize: 13, fontWeight: 800, padding: "9px 24px", borderRadius: 10,
                  background: "linear-gradient(135deg, var(--acc-500), var(--acc-700))",
                  color: "#fff", border: "none",
                  cursor: approve.isPending ? "wait" : "pointer",
                  boxShadow: "0 4px 14px rgba(0,212,255,0.3)",
                  opacity: approve.isPending ? 0.7 : 1,
                }}
              >
                {approve.isPending ? "Approving…" : "Confirm & Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
