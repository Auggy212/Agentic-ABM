import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Btn from "@/components/ui/Btn";
import BuyerView from "./BuyerView";
import ClientFeedbackPanel from "./ClientFeedbackPanel";
import CP3ApprovalFooter from "./CP3ApprovalFooter";
import MessageView from "./MessageView";
import SendToClientPanel from "./SendToClientPanel";
import {
  DEFAULT_CP3_CLIENT_ID,
  type CP3Filters,
  type MessageReviewDecision,
} from "./types";
import {
  useApproveBuyer,
  useApproveCP3,
  useCP3State,
  useMarkOperatorComplete,
  useMessageOpened,
  useResolveFeedback,
  useReviewMessage,
  useSendToClient,
} from "./hooks";

const statusColor: Record<string, string> = {
  NOT_STARTED: "var(--text-3)",
  OPERATOR_REVIEW: "var(--warn-700)",
  CLIENT_REVIEW: "var(--acc-700)",
  CHANGES_REQUESTED: "var(--bad-700)",
  APPROVED: "var(--good-700)",
  REJECTED: "var(--bad-700)",
};

const defaultFilters: CP3Filters = {
  channel: "ALL",
  tier: "ALL",
  validation: "ALL",
  reviewState: "ALL",
  issuesOnly: false,
  contactId: null,
};

export default function CP3OperatorPage() {
  const [params] = useSearchParams();
  const clientId = params.get("client_id") || DEFAULT_CP3_CLIENT_ID;
  const [view, setView] = useState<"message" | "buyer">("message");
  const [filters, setFilters] = useState<CP3Filters>(defaultFilters);
  const [shareUrl, setShareUrl] = useState<string | undefined>();
  const query = useCP3State(clientId);
  const reviewMessage = useReviewMessage(clientId);
  const opened = useMessageOpened(clientId);
  const approveBuyer = useApproveBuyer(clientId);
  const complete = useMarkOperatorComplete(clientId);
  const sendToClient = useSendToClient(clientId);
  const resolveFeedback = useResolveFeedback(clientId);
  const approveCP3 = useApproveCP3(clientId);

  const state = query.data;
  const quality = useMemo(() => {
    const messages = state?.messages || [];
    return {
      hard: messages.filter((message) => message.validation_state.traceability === "HARD_FAIL").length,
      soft: messages.filter((message) => message.validation_state.traceability === "SOFT_FAIL").length,
      diversity: messages.filter((message) => message.validation_state.diversity === "FAILED").length,
    };
  }, [state?.messages]);

  if (query.isLoading) {
    return <div className="page-body" style={{ display: "grid", placeItems: "center", minHeight: 320 }}><LoadingSpinner size="lg" label="Loading CP3 review" /></div>;
  }
  if (!state) {
    return <div className="page-body"><div className="card card-pad">CP3 review state is not available yet.</div></div>;
  }

  const onReview = (messageId: string, decision: MessageReviewDecision, edits?: { layer: string; before: string; after: string }[], notes?: string) => {
    reviewMessage.mutate({ messageId, decision, edits, reviewNotes: notes });
  };

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>Checkpoint 3</h1>
        <div className="page-head-meta">Operator Review · Phase 5 is locked until you and the client approve.</div>
      </div>

      <div className="page-body" style={{ display: "grid", gap: 16 }}>
        <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center", borderRadius: 8 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ padding: "4px 10px", borderRadius: 999, background: "var(--surface-2)", color: statusColor[state.status], fontWeight: 900, fontSize: 12 }}>
              {state.status}
            </span>
            <span style={{ fontWeight: 800 }}>
              {state.aggregate_progress.reviewed_messages} / {state.aggregate_progress.total_messages} messages reviewed ·{" "}
              {state.aggregate_progress.approved_buyers} / {state.aggregate_progress.total_buyers} buyers approved
            </span>
            <span className="chip" style={{ color: quality.hard ? "var(--bad-700)" : undefined }}>{quality.hard} hard</span>
            <span className="chip" style={{ color: quality.soft ? "var(--warn-700)" : undefined }}>{quality.soft} soft</span>
            <span className="chip">{quality.diversity} collisions</span>
          </div>
          <div className="grid-tabs">
            <button className="grid-tab" data-active={String(view === "message")} onClick={() => setView("message")}>Message View</button>
            <button className="grid-tab" data-active={String(view === "buyer")} onClick={() => setView("buyer")}>Buyer View</button>
          </div>
        </div>

        {filters.contactId && (
          <div className="banner" style={{ borderRadius: 8 }}>
            <div className="banner-body">
              <div className="banner-title">Filtered to one buyer</div>
              <div className="banner-text">{filters.contactId}</div>
            </div>
            <Btn size="sm" variant="ghost" onClick={() => setFilters({ ...filters, contactId: null })}>Clear</Btn>
          </div>
        )}

        {view === "message" ? (
          <MessageView
            state={state}
            filters={filters}
            setFilters={setFilters}
            onReview={onReview}
            onOpened={(messageId) => opened.mutate(messageId)}
            onRegenerate={(messageId, reason) => reviewMessage.mutate({ messageId, decision: "REGENERATED", reviewNotes: reason })}
          />
        ) : (
          <BuyerView
            state={state}
            setFilters={(next) => { setFilters(next); setView("message"); }}
            onApproveBuyer={(contactId) => approveBuyer.mutate({ contactId })}
          />
        )}

        <SendToClientPanel
          state={state}
          shareUrl={shareUrl}
          onSend={(email, sampleIds) => sendToClient.mutate(
            { clientEmail: email, sampleMessageIds: sampleIds },
            { onSuccess: (data) => setShareUrl(data.share_url) },
          )}
        />

        <ClientFeedbackPanel
          state={state}
          onResolve={(feedbackId, resolutionNotes) => resolveFeedback.mutate({ feedbackId, resolutionNotes })}
        />

        <CP3ApprovalFooter
          state={state}
          onOperatorComplete={() => complete.mutate()}
          onApproveCP3={() => approveCP3.mutate()}
        />
      </div>
    </>
  );
}
