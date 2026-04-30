import { useState } from "react";
import { useApproveCP2 } from "./hooks";
import type { CP2ReviewState } from "./types";

interface Props {
  clientId: string;
  state: CP2ReviewState;
}

export default function CP2ApprovalFooter({ clientId, state }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState(state.reviewer_notes ?? "");
  const approve = useApproveCP2(clientId);

  const pending = state.aggregate_progress.total_inferred_claims - state.aggregate_progress.reviewed_claims;
  const blocked = state.blockers.length > 0 || pending > 0;
  const alreadyApproved = state.status === "APPROVED";

  if (alreadyApproved) {
    return (
      <div
        data-testid="cp2-approved-footer"
        style={{
          position: "sticky",
          bottom: 0,
          background: "#dcfce7",
          color: "#15803d",
          padding: 16,
          fontWeight: 800,
          fontSize: 14,
          textAlign: "center",
          borderTop: "1px solid #bbf7d0",
        }}
      >
        ✓ CP2 approved — Phase 4 (Storyteller) is unlocked.
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--surface-1)",
          borderTop: "1px solid var(--border)",
          padding: 16,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 16,
          alignItems: "center",
          boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>
            {state.aggregate_progress.total_inferred_claims} inferred claims ·{" "}
            {state.aggregate_progress.reviewed_claims} reviewed · {pending} pending
          </div>
          {state.blockers.length > 0 && (
            <div data-testid="footer-blockers" style={{ fontSize: 12, color: "#b91c1c" }}>
              Blockers: {state.blockers.map((b) => b.message).join(" · ")}
            </div>
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reviewer notes (optional)"
            rows={2}
            style={{
              padding: 8,
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
              maxWidth: 600,
            }}
          />
        </div>
        <button
          type="button"
          data-testid="approve-cp2-btn"
          className="btn-primary"
          disabled={blocked}
          title={blocked ? "All claims and accounts must be decided first" : undefined}
          onClick={() => setConfirming(true)}
          style={{ minWidth: 200, height: 56, fontSize: 16, fontWeight: 800 }}
        >
          Approve CP2
        </button>
      </div>

      {confirming && (
        <div
          data-testid="cp2-confirm-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="card card-pad"
            style={{ maxWidth: 520, background: "var(--surface-1)", display: "grid", gap: 12 }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Approve CP2?</h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Approving CP2 will:</p>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
              <li>Lock all reviewed claims (further edits require re-opening CP2)</li>
              <li>Unblock Phase 4 (Storyteller will start drafting messages)</li>
              <li>Remove flagged accounts from the pipeline permanently</li>
              <li>Send a notification to the team</li>
            </ol>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                data-testid="approve-cp2-confirm"
                disabled={approve.isPending}
                onClick={() =>
                  approve.mutate(
                    { reviewerNotes: notes || null },
                    { onSuccess: () => setConfirming(false) },
                  )
                }
              >
                {approve.isPending ? "Approving…" : "Confirm approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
