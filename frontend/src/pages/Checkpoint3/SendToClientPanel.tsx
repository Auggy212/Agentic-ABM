import { useMemo, useState } from "react";
import Btn from "@/components/ui/Btn";
import type { CP3ReviewState } from "./types";

export default function SendToClientPanel({
  state,
  shareUrl,
  onSend,
}: {
  state: CP3ReviewState;
  shareUrl?: string;
  onSend: (email: string, sampleIds: string[]) => void;
}) {
  const defaultSamples = useMemo(() => {
    return (state.messages || [])
      .filter((message) => message.validation_state.traceability === "PASSED" && message.validation_state.diversity === "PASSED")
      .sort((a, b) => (a.tier === "TIER_1" ? -1 : 1) - (b.tier === "TIER_1" ? -1 : 1))
      .slice(0, 5)
      .map((message) => message.message_id);
  }, [state.messages]);
  const [email, setEmail] = useState(state.client_share_email || "client@example.com");
  const [sampleIds, setSampleIds] = useState<string[]>(state.client_review_sample_ids.length ? state.client_review_sample_ids : defaultSamples);

  if (!["CLIENT_REVIEW", "CHANGES_REQUESTED"].includes(state.status)) return null;

  return (
    <div className="card card-pad" style={{ borderRadius: 8, display: "grid", gap: 14 }}>
      <div>
        <div className="section-eyebrow">Client review</div>
        <h3 style={{ margin: "4px 0 0", fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400 }}>Send curated sample</h3>
      </div>

      {state.client_share_sent_at ? (
        <div className="banner" data-tone="good" style={{ borderRadius: 8 }}>
          <div className="banner-body">
            <div className="banner-title">Awaiting client review</div>
            <div className="banner-text">
              Sent to {state.client_share_email} · {new Date(state.client_share_sent_at).toLocaleString()}
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
          Client email
          <input className="abm-input" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Five sample messages</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(state.messages || []).slice(0, 18).map((message) => {
              const checked = sampleIds.includes(message.message_id);
              return (
                <label key={message.message_id} className="chip" style={{ cursor: "pointer", background: checked ? "var(--ink-900)" : "var(--surface-2)", color: checked ? "var(--ink-paper)" : "var(--text-2)" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && sampleIds.length >= 5}
                    onChange={(event) => {
                      setSampleIds((current) => event.target.checked ? [...current, message.message_id].slice(0, 5) : current.filter((id) => id !== message.message_id));
                    }}
                  />
                  {message.channel.replace(/_/g, " ")} {message.sequence_position}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--surface-2)", color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>
        Hi client, please review these five sample outreach messages. You can add comments inline and approve when they look ready.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Btn variant="primary" disabled={!email || sampleIds.length !== 5} onClick={() => onSend(email, sampleIds)}>
          Send to Client
        </Btn>
        {shareUrl || state.client_share_token ? (
          <input
            className="abm-input"
            readOnly
            value={shareUrl || `http://localhost:5173/client-review/${state.client_share_token}`}
            style={{ maxWidth: 520 }}
          />
        ) : null}
      </div>
    </div>
  );
}
