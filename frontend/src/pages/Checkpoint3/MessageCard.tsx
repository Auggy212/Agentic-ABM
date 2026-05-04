import { useMemo, useState } from "react";
import Btn from "@/components/ui/Btn";
import Icon from "@/components/ui/Icon";
import Tooltip from "@/components/ui/Tooltip";
import type { Message, MessageReview, MessageReviewDecision, PersonalizationLayer } from "./types";
import { CHANNEL_LABEL } from "./types";
import { useMessageOpenTelemetry } from "./hooks/useMessageOpenTelemetry";

const layerColor: Record<string, string> = {
  account_hook: "#2563eb",
  buyer_hook: "#15803d",
  pain: "#b45309",
  value: "#7c3aed",
};

function tierClass(tier: string) {
  if (tier === "TIER_1") return "tier-badge tier-T1";
  if (tier === "TIER_2") return "tier-badge tier-T2";
  return "tier-badge tier-T3";
}

function ValidationBadge({ label, tone, detail }: { label: string; tone: "good" | "warn" | "bad"; detail?: string }) {
  const color = tone === "good" ? "var(--good-700)" : tone === "warn" ? "var(--warn-700)" : "var(--bad-700)";
  const bg = tone === "good" ? "var(--good-50)" : tone === "warn" ? "var(--warn-50)" : "var(--bad-50)";
  return (
    <Tooltip content={detail || label}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 6, background: bg, color, fontSize: 12, fontWeight: 700 }}>
        <span className={`dot dot-${tone === "bad" ? "bad" : tone === "warn" ? "warn" : "good"}`} />
        {label}
      </span>
    </Tooltip>
  );
}

function LayerPill({ name, layer }: { name: string; layer: PersonalizationLayer }) {
  const color = layer.untraced ? "var(--bad-700)" : layerColor[name];
  return (
    <Tooltip content={`${layer.source_type}${layer.source_claim_id ? ` · ${layer.source_claim_id}` : ""}${layer.claim_text ? ` · ${layer.claim_text}` : ""}`}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          borderBottom: `2px solid ${color}`,
          color: layer.untraced ? "var(--bad-700)" : "var(--text)",
          fontSize: 12,
          paddingBottom: 2,
        }}
      >
        {layer.untraced && <Icon name="warn" size={12} />}
        <strong style={{ color }}>{name.replace("_", " ")}</strong>
        <span style={{ color: "var(--text-2)" }}>{layer.text || "untraced"}</span>
      </span>
    </Tooltip>
  );
}

function HighlightedBody({ message }: { message: Message }) {
  const body = message.body;
  const layerEntries = Object.entries(message.personalization_layers);
  const matched = layerEntries.find(([, layer]) => layer.text && body.includes(layer.text));
  if (!matched) {
    return <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{body}</div>;
  }
  const [name, layer] = matched;
  const [before, after] = body.split(layer.text);
  return (
    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
      {before}
      <Tooltip content={`${layer.source_type} · ${layer.source_claim_id || "untraced"}`}>
        <span style={{ borderBottom: `2px solid ${layer.untraced ? "var(--bad-700)" : layerColor[name]}` }}>{layer.text}</span>
      </Tooltip>
      {after}
    </div>
  );
}

export default function MessageCard({
  message,
  review,
  onReview,
  onOpened,
  onRegenerate,
}: {
  message: Message;
  review?: MessageReview;
  onReview: (messageId: string, decision: MessageReviewDecision, edits?: { layer: string; before: string; after: string }[], notes?: string) => void;
  onOpened: (messageId: string) => void;
  onRegenerate: (messageId: string, reason: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [rejectReason, setRejectReason] = useState("");
  const ref = useMessageOpenTelemetry(message.message_id, onOpened);
  const traceTone = message.validation_state.traceability === "HARD_FAIL" ? "bad" : message.validation_state.traceability === "SOFT_FAIL" ? "warn" : "good";
  const decision = review?.review_decision ?? "PENDING";
  const severity = useMemo(() => {
    if (message.validation_state.traceability === "HARD_FAIL") return 3;
    if (message.validation_state.traceability === "SOFT_FAIL") return 2;
    if (message.validation_state.diversity === "FAILED") return 1;
    return 0;
  }, [message]);

  return (
    <article
      ref={ref as React.RefObject<HTMLElement>}
      data-severity={severity}
      className="card card-pad"
      style={{ borderRadius: 8, display: "grid", gap: 14, scrollMarginTop: 90 }}
      id={`message-${message.message_id}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, color: "var(--text)" }}>
            {message.account_company || message.account_domain} · {message.contact_name || "Account-level"}{" "}
            <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{message.contact_title}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span className="chip">{CHANNEL_LABEL[message.channel]} · {message.sequence_position}</span>
            <span className={tierClass(message.tier)}>{message.tier.replace("TIER_", "T")}</span>
            {decision !== "PENDING" && <span className="chip">{decision}</span>}
            {review?.opened_count ? <span className="chip">opened {review.opened_count}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "start", flexWrap: "wrap" }}>
          <ValidationBadge label={message.validation_state.traceability === "PASSED" ? "Traced" : message.validation_state.traceability === "SOFT_FAIL" ? "Soft Fail" : "Hard Fail"} tone={traceTone} detail={message.validation_state.traceability_failures.map((f) => `${f.layer}: ${f.reason}`).join("\n") || "All layers traced"} />
          <ValidationBadge label={message.validation_state.diversity === "FAILED" ? `Collides with ${message.validation_state.diversity_collision_with.length}` : "Unique"} tone={message.validation_state.diversity === "FAILED" ? "warn" : "good"} />
          <ValidationBadge label="Fresh" tone="good" />
        </div>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--surface-2)" }}>
        {message.subject && (
          <div style={{ marginBottom: 10 }}>
            <span className="section-eyebrow">Subject</span>
            <div style={{ fontWeight: 800 }}>{message.subject}</div>
          </div>
        )}
        {editing ? (
          <textarea className="abm-input" value={draft} onChange={(event) => setDraft(event.target.value)} style={{ minHeight: 150 }} />
        ) : (
          <HighlightedBody message={message} />
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(message.personalization_layers).map(([name, layer]) => (
          <LayerPill key={name} name={name} layer={layer} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {editing ? (
          <>
            <Btn size="sm" variant="primary" icon="check" onClick={() => { onReview(message.message_id, "EDITED", [{ layer: "body", before: message.body, after: draft }], "Edited body copy"); setEditing(false); }}>
              Save Edit
            </Btn>
            <Btn size="sm" variant="ghost" icon="x" onClick={() => { setDraft(message.body); setEditing(false); }}>Cancel</Btn>
          </>
        ) : (
          <>
            <Btn size="sm" variant="primary" icon="check" onClick={() => onReview(message.message_id, "APPROVED")}>Approve</Btn>
            <Btn size="sm" icon="intake" onClick={() => setEditing(true)}>Edit</Btn>
            <Btn size="sm" icon="sparkle" onClick={() => onRegenerate(message.message_id, "Operator requested a stronger traced hook")}>Regenerate</Btn>
            <input
              aria-label="Reject reason"
              className="abm-input"
              placeholder="Reject reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              style={{ width: 180, height: 30, padding: "5px 8px" }}
            />
            <Btn size="sm" variant="danger-ghost" icon="x" disabled={!rejectReason.trim()} onClick={() => onReview(message.message_id, "REJECTED", undefined, rejectReason)}>Reject</Btn>
          </>
        )}
        {decision !== "PENDING" && (
          <button type="button" className="btn btn-sm" data-variant="ghost" onClick={() => onReview(message.message_id, "PENDING")}>
            Undo
          </button>
        )}
      </div>
    </article>
  );
}
