import { useParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ClientApprovePanel from "./ClientApprovePanel";
import ClientGeneralFeedbackPanel from "./ClientGeneralFeedbackPanel";
import ClientMessageCard from "./ClientMessageCard";
import ClientReviewLayout from "./ClientReviewLayout";
import { useApproveClientReview, useClientReview, useSubmitFeedback } from "./hooks";
import type { FeedbackSentiment } from "@/pages/Checkpoint3/types";

export default function ClientReviewPage() {
  const { share_token } = useParams();
  const query = useClientReview(share_token);
  const submit = useSubmitFeedback(share_token || "");
  const approve = useApproveClientReview(share_token || "");

  if (query.isLoading) {
    return <ClientReviewLayout><div style={{ display: "grid", placeItems: "center", minHeight: 300 }}><LoadingSpinner size="lg" label="Loading review" /></div></ClientReviewLayout>;
  }
  if (query.isError || !query.data) {
    return (
      <ClientReviewLayout>
        <div className="card card-pad" style={{ borderRadius: 8 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: 0 }}>This link has expired or is invalid.</h1>
          <p style={{ color: "var(--text-2)" }}>Please contact your Operator for a new link.</p>
        </div>
      </ClientReviewLayout>
    );
  }

  const data = query.data;
  const approved = data.submission_status === "signed" || approve.isSuccess;
  const submitFeedback = (messageId: string | null, text: string, sentiment: FeedbackSentiment) => {
    submit.mutate({ messageId, feedbackText: text, sentiment });
  };

  return (
    <ClientReviewLayout>
      <div style={{ display: "grid", gap: 18 }}>
        <header style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="nav-brand-mark">{data.client_company_name.slice(0, 1)}</div>
            <div style={{ fontWeight: 900 }}>{data.client_company_name}</div>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 400, margin: 0 }}>Sample Outreach Messages</h1>
          <p style={{ color: "var(--text-2)", fontSize: 16, lineHeight: 1.6, maxWidth: 720, margin: 0 }}>
            Before we launch outreach to {data.aggregate_progress.total_messages} messages, please review these five samples. Add comments where helpful, then approve when satisfied.
          </p>
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>
            Sent by {data.operator_name} · Expires {new Date(data.expires_at).toLocaleDateString()}
          </div>
        </header>

        {data.messages.map((message) => (
          <ClientMessageCard
            key={message.message_id}
            message={message}
            feedback={data.client_feedback.filter((item) => item.message_id === message.message_id)}
            onSubmit={submitFeedback}
          />
        ))}

        <ClientGeneralFeedbackPanel onSubmit={(text, sentiment) => submitFeedback(null, text, sentiment)} />
        <ClientApprovePanel feedback={data.client_feedback} approved={approved} onApprove={(name) => approve.mutate(name)} />
      </div>
    </ClientReviewLayout>
  );
}
