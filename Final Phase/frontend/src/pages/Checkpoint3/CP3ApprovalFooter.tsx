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
      <div style={{ fontSize: 13, fontWeight: 800 }}>
        {state.aggregate_progress.reviewed_messages} / {state.aggregate_progress.total_messages} messages reviewed ·{" "}
        {state.aggregate_progress.approved_buyers} / {state.aggregate_progress.total_buyers} buyers approved
      </div>
      {state.status === "OPERATOR_REVIEW" ? (
        <Btn variant="primary" disabled={!canCompleteOperator} onClick={onOperatorComplete}>
          Mark Operator Review Complete
        </Btn>
      ) : (
        <Btn variant="primary" disabled={!canApprove} onClick={onApproveCP3}>
          Approve CP3
        </Btn>
      )}
    </div>
  );
}
