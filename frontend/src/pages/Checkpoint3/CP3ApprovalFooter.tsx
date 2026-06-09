import Btn from "@/components/ui/Btn";
import type { CP3ReviewState } from "./types";

export default function CP3ApprovalFooter({
  state,
  onOperatorComplete,
  onApproveCP3,
}: {
  state: CP3ReviewState;
  onOperatorComplete: () => void;
  onApproveCP3: () => void;
}) {
  const allOpened = state.message_reviews.every((review) => review.opened_count >= 1);
  const allBuyersDecided = state.buyer_approvals.every((buyer) => buyer.buyer_decision !== "PENDING");
  const canCompleteOperator = allOpened && allBuyersDecided;
  const canApprove = state.status === "CLIENT_REVIEW" && state.aggregate_progress.client_feedback_unresolved === 0 && Boolean(state.client_completed_at);

  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 20,
        margin: "0 -28px -64px",
        padding: "12px 28px",
        borderTop: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--surface-app) 94%, transparent)",
        backdropFilter: "blur(12px)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>
          {state.aggregate_progress.reviewed_messages} / {state.aggregate_progress.total_messages} messages reviewed ·{" "}
          {state.aggregate_progress.approved_buyers} / {state.aggregate_progress.total_buyers} buyers approved
        </div>
        {state.status === "OPERATOR_REVIEW" && !canCompleteOperator && (
          <div style={{ fontSize: 11, color: "#92400e" }}>
            Open every message and approve all buyers before marking complete
          </div>
        )}
        {state.status !== "OPERATOR_REVIEW" && !canApprove && (
          <div style={{ fontSize: 11, color: "#92400e" }}>
            {!state.client_completed_at
              ? "Waiting for the client to complete their review"
              : `${state.aggregate_progress.client_feedback_unresolved} unresolved client feedback item${state.aggregate_progress.client_feedback_unresolved !== 1 ? "s" : ""} — resolve all before approving`}
          </div>
        )}
      </div>
      {state.status === "OPERATOR_REVIEW" ? (
        <Btn
          variant="primary"
          disabled={!canCompleteOperator}
          onClick={onOperatorComplete}
          title={canCompleteOperator ? "Marks your review done and enables sending samples to the client" : "Open every message and approve all buyers first"}
        >
          ✓ Done reviewing — send to client
        </Btn>
      ) : (
        <Btn
          variant="primary"
          disabled={!canApprove}
          onClick={onApproveCP3}
          title={canApprove ? "Approves CP3 and unlocks the Campaign Agent" : "Resolve all client feedback first"}
        >
          🚀 Approve CP3 — unlock campaign
        </Btn>
      )}
    </div>
  );
}
