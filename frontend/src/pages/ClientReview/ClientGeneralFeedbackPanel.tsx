import { useState } from "react";
import Btn from "@/components/ui/Btn";
import type { FeedbackSentiment } from "@/pages/Checkpoint3/types";

export default function ClientGeneralFeedbackPanel({
  onSubmit,
}: {
  onSubmit: (text: string, sentiment: FeedbackSentiment) => void;
}) {
  const [text, setText] = useState("");
  const [sentiment, setSentiment] = useState<FeedbackSentiment>("NEUTRAL");
  return (
    <div className="card card-pad" style={{ borderRadius: 8, display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 900 }}>General feedback</div>
      <textarea className="abm-input" value={text} onChange={(event) => setText(event.target.value)} placeholder="Feedback not tied to a specific message" />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select className="abm-input" value={sentiment} onChange={(event) => setSentiment(event.target.value as FeedbackSentiment)} style={{ width: 180 }}>
          <option value="POSITIVE">Positive</option>
          <option value="NEUTRAL">Suggestion</option>
          <option value="CHANGE_REQUEST">Change request</option>
        </select>
        <Btn variant="primary" disabled={!text.trim()} onClick={() => { onSubmit(text, sentiment); setText(""); }}>Submit Feedback</Btn>
      </div>
    </div>
  );
}
