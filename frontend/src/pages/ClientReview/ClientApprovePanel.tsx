import { useState } from "react";
import Btn from "@/components/ui/Btn";
import type { ClientFeedback } from "@/pages/Checkpoint3/types";

export default function ClientApprovePanel({
  feedback,
  approved,
  onApprove,
}: {
  feedback: ClientFeedback[];
  approved: boolean;
  onApprove: (signatureName: string) => void;
}) {
  const [name, setName] = useState("");
  const hasChangeRequest = feedback.some((item) => item.sentiment === "CHANGE_REQUEST");
  if (approved) {
    return (
      <div className="banner" data-tone="good" style={{ borderRadius: 8 }}>
        <div className="banner-body">
          <div className="banner-title">Thanks, {name || "you"}.</div>
          <div className="banner-text">Outreach will begin within 24 hours. Your Operator will notify you when first replies come in.</div>
        </div>
      </div>
    );
  }
  if (hasChangeRequest) {
    return (
      <div className="banner" data-tone="warn" style={{ borderRadius: 8 }}>
        <div className="banner-body">
          <div className="banner-title">Changes requested</div>
          <div className="banner-text">Your Operator will address the requested changes and re-share the review.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="card card-pad" style={{ borderRadius: 8, display: "grid", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 900 }}>Looks good?</div>
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>Type your full name to confirm approval.</div>
      </div>
      <input className="abm-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />
      <Btn variant="primary" disabled={!name.trim()} onClick={() => onApprove(name)}>
        Approve & Launch
      </Btn>
    </div>
  );
}
