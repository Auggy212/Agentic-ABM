import { useState } from "react";
import Btn from "@/components/ui/Btn";
import type { CP3ReviewState, FeedbackSentiment } from "./types";

const sentimentColor: Record<FeedbackSentiment, string> = {
  POSITIVE: "var(--good-700)",
  NEUTRAL: "var(--text-2)",
  NEGATIVE: "var(--bad-700)",
  CHANGE_REQUEST: "var(--warn-700)",
};

export default function ClientFeedbackPanel({
  state,
  onResolve,
}: {
  state: CP3ReviewState;
  onResolve: (feedbackId: string, notes: string) => void;
}) {
  const [filter, setFilter] = useState<"ALL" | "UNRESOLVED" | "CHANGE_REQUEST" | "POSITIVE" | "RESOLVED">("ALL");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const items = state.client_feedback.filter((item) => {
    if (filter === "UNRESOLVED") return !item.resolved;
    if (filter === "RESOLVED") return item.resolved;
    if (filter === "CHANGE_REQUEST") return item.sentiment === "CHANGE_REQUEST";
    if (filter === "POSITIVE") return item.sentiment === "POSITIVE";
    return true;
  });
  if (!state.client_feedback.length) return null;

  return (
    <div className="card card-pad" style={{ borderRadius: 8, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="section-eyebrow">Client feedback</div>
          <div style={{ fontWeight: 800 }}>{state.aggregate_progress.client_feedback_unresolved} unresolved feedback items</div>
          <div style={{ color: "var(--text-3)", fontSize: 12 }}>CP3 cannot be approved until all feedback is resolved.</div>
        </div>
        <select className="abm-input" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} style={{ width: 190 }}>
          <option value="ALL">All feedback</option>
          <option value="UNRESOLVED">Unresolved</option>
          <option value="CHANGE_REQUEST">Change requests</option>
          <option value="POSITIVE">Positive feedback</option>
          <option value="RESOLVED">Resolved</option>
        </select>
      </div>
      {items.map((item) => (
        <div key={item.feedback_id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="chip" style={{ color: sentimentColor[item.sentiment] }}>{item.sentiment}</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(item.submitted_at).toLocaleString()}</span>
            {item.message_id && <a className="chip" href={`#message-${item.message_id}`}>Open message</a>}
            {item.resolved && <span className="chip">Resolved</span>}
          </div>
          <div style={{ lineHeight: 1.5 }}>{item.feedback_text}</div>
          {!item.resolved && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="abm-input"
                placeholder="Resolution notes"
                value={notes[item.feedback_id] || ""}
                onChange={(event) => setNotes({ ...notes, [item.feedback_id]: event.target.value })}
              />
              <Btn size="sm" variant="primary" disabled={!notes[item.feedback_id]?.trim()} onClick={() => onResolve(item.feedback_id, notes[item.feedback_id])}>
                Resolve
              </Btn>
              <Btn size="sm" variant="ghost">In Progress</Btn>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
