import Btn from "@/components/ui/Btn";
import Tooltip from "@/components/ui/Tooltip";
import type { CP3Filters, CP3ReviewState, Message } from "./types";
import { CHANNEL_LABEL } from "./types";

function messagesForBuyer(state: CP3ReviewState, contactId: string): Message[] {
  return (state.messages || []).filter((message) => message.contact_id === contactId);
}

export default function BuyerView({
  state,
  setFilters,
  onApproveBuyer,
}: {
  state: CP3ReviewState;
  setFilters: (filters: CP3Filters) => void;
  onApproveBuyer: (contactId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 8 }}>
        <div>
          <div style={{ fontWeight: 800 }}>Buyer review queue</div>
          <div style={{ color: "var(--text-3)", fontSize: 12 }}>Approve buyers only after every message has been reviewed.</div>
        </div>
        <Btn
          size="sm"
          variant="primary"
          onClick={() => state.buyer_approvals.filter((buyer) => buyer.all_messages_reviewed && buyer.buyer_decision === "PENDING").forEach((buyer) => onApproveBuyer(buyer.contact_id))}
        >
          Approve Eligible
        </Btn>
      </div>

      {state.buyer_approvals.map((buyer) => {
        const messages = messagesForBuyer(state, buyer.contact_id);
        const first = messages[0];
        const reviews = state.message_reviews.filter((review) => messages.some((message) => message.message_id === review.message_id));
        const reviewed = reviews.filter((review) => review.review_decision !== "PENDING").length;
        const hard = messages.filter((message) => message.validation_state.traceability === "HARD_FAIL").length;
        const byChannel = messages.reduce<Record<string, number>>((acc, message) => {
          acc[message.channel] = (acc[message.channel] || 0) + 1;
          return acc;
        }, {});
        const eligible = reviews.length > 0 && reviews.every((review) => review.review_decision !== "PENDING");
        return (
          <div key={buyer.contact_id} className="card card-pad" style={{ borderRadius: 8, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{first?.contact_name || buyer.contact_id}</div>
                <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                  {first?.contact_title || "Buyer"} · {first?.contact_committee_role || "committee"} · {first?.tier || "TIER_3"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="chip">{messages.length} messages</span>
                <span className="chip">{reviewed} / {messages.length} reviewed</span>
                {hard > 0 && <span className="chip" style={{ color: "var(--bad-700)" }}>{hard} hard fail</span>}
              </div>
            </div>
            <div style={{ color: "var(--text-2)", fontSize: 12 }}>
              {Object.entries(byChannel).map(([channel, count]) => `${count} ${CHANNEL_LABEL[channel as keyof typeof CHANNEL_LABEL]}`).join(" · ")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Tooltip content={eligible ? "Buyer is eligible for approval" : `Cannot approve; review all ${messages.length} messages first`}>
                <span>
                  <Btn size="sm" variant="primary" disabled={!eligible} onClick={() => onApproveBuyer(buyer.contact_id)}>
                    Approve Buyer
                  </Btn>
                </span>
              </Tooltip>
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => setFilters({ channel: "ALL", tier: "ALL", validation: "ALL", reviewState: "ALL", issuesOnly: false, contactId: buyer.contact_id })}
              >
                Drill Into Messages
              </Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}
