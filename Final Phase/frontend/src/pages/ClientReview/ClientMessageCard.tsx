import { useState } from "react";
import Btn from "@/components/ui/Btn";
import type { FeedbackSentiment, Message } from "@/pages/Checkpoint3/types";
import { CHANNEL_LABEL } from "@/pages/Checkpoint3/types";

export default function ClientMessageCard({
  message,
  feedback,
  onSubmit,
}: {
  message: Message;
  feedback: { feedback_id: string; feedback_text: string; sentiment: FeedbackSentiment; submitted_at: string }[];
  onSubmit: (messageId: string, text: string, sentiment: FeedbackSentiment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sentiment, setSentiment] = useState<FeedbackSentiment>("NEUTRAL");

  return (
    <article className="card card-pad" style={{ borderRadius: 8, display: "grid", gap: 14 }}>
      <div>
        <div style={{ fontWeight: 900 }}>
          {CHANNEL_LABEL[message.channel]} to {message.contact_name} {message.contact_title ? `(${message.contact_title})` : ""} at {message.account_company || message.account_domain}
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 12 }}>{CHANNEL_LABEL[message.channel]} · sequence {message.sequence_position}</div>
      </div>

      {message.subject && (
        <div>
          <div className="section-eyebrow">Subject</div>
          <div style={{ fontWeight: 800 }}>{message.subject}</div>
        </div>
      )}
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, color: "var(--text-2)" }}>{message.body}</div>

      {feedback.map((item) => (
        <div key={item.feedback_id} style={{ borderLeft: "3px solid var(--acc-500)", paddingLeft: 10, fontSize: 13 }}>
          <strong>{item.sentiment}</strong> · {item.feedback_text}
          <div style={{ color: "var(--text-3)", fontSize: 11 }}>Submitted {new Date(item.submitted_at).toLocaleString()}</div>
        </div>
      ))}

      {open ? (
        <div style={{ display: "grid", gap: 8 }}>
          <textarea className="abm-input" placeholder="Add your comment" value={text} onChange={(event) => setText(event.target.value)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select className="abm-input" value={sentiment} onChange={(event) => setSentiment(event.target.value as FeedbackSentiment)} style={{ width: 180 }}>
              <option value="POSITIVE">Positive</option>
              <option value="NEUTRAL">Suggestion</option>
              <option value="CHANGE_REQUEST">Change request</option>
            </select>
            <Btn variant="primary" disabled={!text.trim()} onClick={() => { onSubmit(message.message_id, text, sentiment); setText(""); setOpen(false); }}>Submit</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <Btn size="sm" icon="intake" onClick={() => setOpen(true)}>Add Comment</Btn>
      )}
    </article>
  );
}
