import MessageCard from "./MessageCard";
import type { CP3Filters, CP3ReviewState, Message } from "./types";
import { CHANNEL_LABEL } from "./types";

function reviewFor(state: CP3ReviewState, messageId: string) {
  return state.message_reviews.find((review) => review.message_id === messageId);
}

function passesFilters(message: Message, state: CP3ReviewState, filters: CP3Filters) {
  const review = reviewFor(state, message.message_id);
  if (filters.channel !== "ALL" && message.channel !== filters.channel) return false;
  if (filters.tier !== "ALL" && message.tier !== filters.tier) return false;
  if (filters.contactId && message.contact_id !== filters.contactId) return false;
  if (filters.reviewState !== "ALL" && review?.review_decision !== filters.reviewState) return false;
  if (filters.issuesOnly && message.validation_state.traceability === "PASSED" && message.validation_state.diversity !== "FAILED") return false;
  if (filters.validation === "HARD_FAIL" && message.validation_state.traceability !== "HARD_FAIL") return false;
  if (filters.validation === "SOFT_FAIL" && message.validation_state.traceability !== "SOFT_FAIL") return false;
  if (filters.validation === "DIVERSITY_COLLISION" && message.validation_state.diversity !== "FAILED") return false;
  if (filters.validation === "ALL_PASS" && (message.validation_state.traceability !== "PASSED" || message.validation_state.diversity !== "PASSED")) return false;
  return true;
}

function severity(message: Message) {
  if (message.validation_state.traceability === "HARD_FAIL") return 30;
  if (message.validation_state.traceability === "SOFT_FAIL") return 20;
  if (message.validation_state.diversity === "FAILED") return 10;
  return 0;
}

export default function MessageView({
  state,
  filters,
  setFilters,
  onReview,
  onOpened,
  onRegenerate,
}: {
  state: CP3ReviewState;
  filters: CP3Filters;
  setFilters: (filters: CP3Filters) => void;
  onReview: Parameters<typeof MessageCard>[0]["onReview"];
  onOpened: (messageId: string) => void;
  onRegenerate: (messageId: string, reason: string) => void;
}) {
  const messages = (state.messages || [])
    .filter((message) => passesFilters(message, state, filters))
    .sort((a, b) => severity(b) - severity(a) || a.account_domain.localeCompare(b.account_domain) || a.sequence_position - b.sequence_position);

  const grouped = messages.reduce<Record<string, Message[]>>((acc, message) => {
    const key = `${message.account_domain} · ${message.contact_name || "Account-level"} · ${CHANNEL_LABEL[message.channel]}`;
    acc[key] = [...(acc[key] || []), message];
    return acc;
  }, {});

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card card-pad" style={{ borderRadius: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select className="abm-input" value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value as CP3Filters["channel"] })} style={{ width: 190 }}>
          <option value="ALL">All channels</option>
          {Object.entries(CHANNEL_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="abm-input" value={filters.tier} onChange={(e) => setFilters({ ...filters, tier: e.target.value as CP3Filters["tier"] })} style={{ width: 120 }}>
          <option value="ALL">All tiers</option>
          <option value="TIER_1">T1</option>
          <option value="TIER_2">T2</option>
          <option value="TIER_3">T3</option>
        </select>
        <select className="abm-input" value={filters.validation} onChange={(e) => setFilters({ ...filters, validation: e.target.value as CP3Filters["validation"] })} style={{ width: 190 }}>
          <option value="ALL">All validation</option>
          <option value="HARD_FAIL">Hard Fail</option>
          <option value="SOFT_FAIL">Soft Fail</option>
          <option value="DIVERSITY_COLLISION">Diversity Collision</option>
          <option value="ALL_PASS">All Pass</option>
        </select>
        <select className="abm-input" value={filters.reviewState} onChange={(e) => setFilters({ ...filters, reviewState: e.target.value as CP3Filters["reviewState"] })} style={{ width: 150 }}>
          <option value="ALL">All review</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="EDITED">Edited</option>
          <option value="REGENERATED">Regenerated</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={filters.issuesOnly} onChange={(e) => setFilters({ ...filters, issuesOnly: e.target.checked })} />
          Show only validation issues
        </label>
        <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: 12 }}>{messages.length} messages</span>
      </div>

      {Object.entries(grouped).map(([group, groupMessages]) => (
        <section key={group} style={{ display: "grid", gap: 10 }}>
          <div className="section-eyebrow">{group}</div>
          {groupMessages.map((message) => (
            <MessageCard
              key={message.message_id}
              message={message}
              review={reviewFor(state, message.message_id)}
              onReview={onReview}
              onOpened={onOpened}
              onRegenerate={onRegenerate}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
