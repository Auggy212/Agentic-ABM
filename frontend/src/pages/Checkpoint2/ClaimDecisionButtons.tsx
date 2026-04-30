import { useState } from "react";
import { useReviewClaim } from "./hooks";
import type { InferredClaimReview, ReviewDecision } from "./types";

interface Props {
  clientId: string;
  claim: InferredClaimReview;
}

const DECISION_LABEL: Record<ReviewDecision, string> = {
  PENDING: "Pending",
  APPROVED: "Approve",
  CORRECTED: "Correct",
  REMOVED: "Remove",
};

export default function ClaimDecisionButtons({ clientId, claim }: Props) {
  const [mode, setMode] = useState<null | "correct" | "remove">(null);
  const [draft, setDraft] = useState(claim.claim_text);
  const [removalReason, setRemovalReason] = useState("");
  const reviewClaim = useReviewClaim(clientId);

  const submit = (decision: ReviewDecision, extras: { correctedText?: string; reviewNotes?: string } = {}) => {
    reviewClaim.mutate(
      {
        claimId: claim.claim_id,
        decision,
        correctedText: extras.correctedText,
        reviewNotes: extras.reviewNotes,
      },
      {
        onSuccess: () => {
          setMode(null);
          setDraft(claim.claim_text);
          setRemovalReason("");
        },
      },
    );
  };

  const isReviewed = claim.review_decision !== "PENDING";
  const decisionTone: Record<ReviewDecision, string> = {
    PENDING: "var(--text-3)",
    APPROVED: "#15803d",
    CORRECTED: "#b45309",
    REMOVED: "var(--text-3)",
  };

  if (isReviewed && mode === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
        <span
          data-testid={`claim-decision-pill-${claim.claim_id}`}
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--surface-2)",
            color: decisionTone[claim.review_decision],
            fontWeight: 800,
          }}
        >
          {DECISION_LABEL[claim.review_decision]}
        </span>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => submit("PENDING")}
          disabled={reviewClaim.isPending}
        >
          Undo
        </button>
      </div>
    );
  }

  if (mode === "correct") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          data-testid={`correct-textarea-${claim.claim_id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          style={{ width: "100%", padding: 8, border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn-primary"
            disabled={!draft.trim() || reviewClaim.isPending}
            onClick={() => submit("CORRECTED", { correctedText: draft.trim() })}
          >
            Save correction
          </button>
          <button type="button" className="btn-ghost" onClick={() => setMode(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "remove") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <input
          data-testid={`remove-reason-${claim.claim_id}`}
          value={removalReason}
          onChange={(e) => setRemovalReason(e.target.value)}
          placeholder="Optional removal reason"
          style={{ width: "100%", padding: 8, border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn-primary"
            disabled={reviewClaim.isPending}
            onClick={() => submit("REMOVED", { reviewNotes: removalReason || undefined })}
          >
            Confirm remove
          </button>
          <button type="button" className="btn-ghost" onClick={() => setMode(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn-primary"
        data-testid={`approve-${claim.claim_id}`}
        disabled={reviewClaim.isPending}
        onClick={() => submit("APPROVED")}
      >
        Approve
      </button>
      <button
        type="button"
        className="btn-secondary"
        data-testid={`correct-${claim.claim_id}`}
        onClick={() => setMode("correct")}
      >
        Correct
      </button>
      <button
        type="button"
        className="btn-ghost"
        data-testid={`remove-${claim.claim_id}`}
        onClick={() => setMode("remove")}
      >
        Remove
      </button>
    </div>
  );
}
