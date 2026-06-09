import { useState } from "react";
import { useReviewClaim } from "./hooks";
import type { InferredClaimReview, ReviewDecision } from "./types";

interface Props {
  clientId: string;
  claim: InferredClaimReview;
}

const DECISION_STYLE: Record<ReviewDecision, { label: string; bg: string; fg: string; border: string }> = {
  PENDING:  { label: "Pending",   bg: "var(--surface-3)",  fg: "var(--text-3)",   border: "var(--border)" },
  APPROVED: { label: "Approved",  bg: "var(--good-50)",    fg: "var(--good-700)", border: "var(--good-100)" },
  CORRECTED:{ label: "Corrected", bg: "#fef3c7",           fg: "#92400e",         border: "#fde68a" },
  REMOVED:  { label: "Removed",   bg: "var(--bad-50)",     fg: "var(--bad-700)",  border: "var(--bad-100)" },
};

export default function ClaimDecisionButtons({ clientId, claim }: Props) {
  const [mode, setMode] = useState<null | "correct" | "remove">(null);
  const [draft, setDraft] = useState(claim.claim_text);
  const [removalReason, setRemovalReason] = useState("");
  const reviewClaim = useReviewClaim(clientId);

  const submit = (decision: ReviewDecision, extras: { correctedText?: string; reviewNotes?: string } = {}) => {
    reviewClaim.mutate(
      { claimId: claim.claim_id, decision, correctedText: extras.correctedText, reviewNotes: extras.reviewNotes },
      { onSuccess: () => { setMode(null); setDraft(claim.claim_text); setRemovalReason(""); } },
    );
  };

  const isReviewed = claim.review_decision !== "PENDING";
  const ds = DECISION_STYLE[claim.review_decision];

  /* ── Already decided ── */
  if (isReviewed && mode === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          data-testid={`claim-decision-pill-${claim.claim_id}`}
          style={{
            padding: "3px 10px", borderRadius: 999,
            background: ds.bg, color: ds.fg, border: `1px solid ${ds.border}`,
            fontSize: 11, fontWeight: 700,
          }}
        >
          {ds.label}
        </span>
        <button
          type="button"
          onClick={() => submit("PENDING")}
          disabled={reviewClaim.isPending}
          style={{
            fontSize: 11, fontWeight: 600, padding: "3px 10px",
            borderRadius: 999, border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--text-3)",
            cursor: "pointer",
          }}
        >
          Undo
        </button>
      </div>
    );
  }

  /* ── Correct mode ── */
  if (mode === "correct") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          data-testid={`correct-textarea-${claim.claim_id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          style={{
            width: "100%", padding: "10px 12px", boxSizing: "border-box",
            border: "1.5px solid var(--acc-300)", borderRadius: 8,
            fontSize: 13, background: "var(--acc-50)", color: "var(--text)",
            outline: "none", resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn-primary"
            disabled={!draft.trim() || reviewClaim.isPending}
            onClick={() => submit("CORRECTED", { correctedText: draft.trim() })}
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            {reviewClaim.isPending ? "Saving…" : "Save correction"}
          </button>
          <button
            type="button"
            onClick={() => setMode(null)}
            style={{
              fontSize: 12, padding: "6px 14px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--text-2)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  /* ── Remove mode ── */
  if (mode === "remove") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <input
          data-testid={`remove-reason-${claim.claim_id}`}
          value={removalReason}
          onChange={(e) => setRemovalReason(e.target.value)}
          placeholder="Optional removal reason"
          style={{
            width: "100%", padding: "8px 12px", boxSizing: "border-box",
            border: "1.5px solid var(--bad-100)", borderRadius: 8,
            fontSize: 13, background: "var(--bad-50)", color: "var(--text)",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={reviewClaim.isPending}
            onClick={() => submit("REMOVED", { reviewNotes: removalReason || undefined })}
            style={{
              fontSize: 12, padding: "6px 14px", borderRadius: 8, cursor: "pointer",
              background: "var(--bad-500,#e0493c)", color: "#fff",
              border: "none", fontWeight: 600,
              opacity: reviewClaim.isPending ? 0.6 : 1,
            }}
          >
            {reviewClaim.isPending ? "Removing…" : "Confirm remove"}
          </button>
          <button
            type="button"
            onClick={() => setMode(null)}
            style={{
              fontSize: 12, padding: "6px 14px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--text-2)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  /* ── Default: action buttons ── */
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      <button
        type="button"
        data-testid={`approve-${claim.claim_id}`}
        disabled={reviewClaim.isPending}
        onClick={() => submit("APPROVED")}
        style={{
          fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 8,
          background: "var(--good-50)", color: "var(--good-700)",
          border: "1px solid var(--good-100)", cursor: "pointer",
          opacity: reviewClaim.isPending ? 0.6 : 1,
        }}
      >
        ✓ Approve
      </button>
      <button
        type="button"
        data-testid={`correct-${claim.claim_id}`}
        onClick={() => setMode("correct")}
        style={{
          fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 8,
          background: "#fef3c7", color: "#92400e",
          border: "1px solid #fde68a", cursor: "pointer",
        }}
      >
        ✎ Correct
      </button>
      <button
        type="button"
        data-testid={`remove-${claim.claim_id}`}
        onClick={() => setMode("remove")}
        style={{
          fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 8,
          background: "var(--surface-2)", color: "var(--text-3)",
          border: "1px solid var(--border)", cursor: "pointer",
        }}
      >
        ✕ Remove
      </button>
    </div>
  );
}
