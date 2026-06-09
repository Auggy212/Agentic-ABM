import type {
  BuyerApproval,
  ClientFeedback,
  CP3ReviewState,
  FeedbackSentiment,
  Message,
  MessageChannel,
  MessageReview,
  MessageReviewDecision,
  Tier,
} from "@/pages/Checkpoint3/types";

const CLIENT_ID = "12345678-1234-5678-1234-567812345678";
export const MOCK_CP3_SHARE_TOKEN = "44444444-5555-6666-7777-888888888888";

function id(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(4, "0")}-aaaa-bbbb-cccccccccccc`;
}

function layer(text: string, sourceType: string, n: number, untraced = false) {
  return {
    text,
    source_claim_id: untraced ? null : id("claim", n),
    source_type: untraced ? "UNTRACED" : sourceType,
    untraced,
    claim_text: text,
  };
}

function channelFor(index: number): MessageChannel {
  if (index % 47 === 0) return "REDDIT_STRATEGY_NOTE";
  if (index % 13 === 0) return "WHATSAPP";
  if (index % 3 === 0) return "EMAIL";
  if (index % 3 === 1) return "LINKEDIN_DM";
  return "LINKEDIN_CONNECTION";
}

function decisionFor(index: number): MessageReviewDecision {
  if (index <= 118) return "APPROVED";
  if (index <= 132) return "EDITED";
  if (index <= 138) return index % 2 ? "REGENERATED" : "REJECTED";
  return "PENDING";
}

export const mockCP3Messages: Message[] = Array.from({ length: 274 }, (_, i) => {
  const n = i + 1;
  const buyerIndex = ((n - 1) % 50) + 1;
  const tier: Tier = n <= 132 ? "TIER_1" : n <= 210 ? "TIER_2" : "TIER_3";
  const channel = channelFor(n);
  const hardFail = n <= 5;
  const softFail = n > 132 && n <= 166;
  const diversityFail = [29, 88, 141, 177, 219, 241].includes(n);
  const contactName = `Buyer ${buyerIndex}`;
  const accountCompany = `Account ${Math.ceil(buyerIndex / 2)}`;
  const accountDomain = `account-${Math.ceil(buyerIndex / 2)}.com`;
  const body =
    channel === "REDDIT_STRATEGY_NOTE"
      ? `## Reddit strategy for ${accountCompany}\n\nJoin relevant RevOps and SaaS discussions with practical lessons about pipeline quality. Avoid pitching in first comments.`
      : `Hi ${contactName}, noticed ${accountCompany} is prioritizing pipeline quality. Your revenue team is likely trying to reduce manual account research while keeping messaging specific. FCP helps teams turn verified account signals into outreach operators can trust. Worth a quick comparison?`;

  return {
    message_id: id("msg", n),
    client_id: CLIENT_ID,
    account_domain: accountDomain,
    account_company: accountCompany,
    contact_id: channel === "REDDIT_STRATEGY_NOTE" ? null : id("contact", buyerIndex),
    contact_name: channel === "REDDIT_STRATEGY_NOTE" ? "Account-level brief" : contactName,
    contact_title: buyerIndex % 5 === 0 ? "Chief Revenue Officer" : "VP Revenue",
    contact_committee_role: buyerIndex % 8 === 0 ? "CHAMPION" : "DECISION_MAKER",
    tier,
    channel,
    sequence_position: channel === "EMAIL" ? (n % 5) : channel === "LINKEDIN_DM" ? (n % 3) : 0,
    subject: channel === "EMAIL" ? `Idea for ${accountCompany}` : null,
    body,
    personalization_layers: {
      account_hook: layer(`${accountCompany} is prioritizing pipeline quality`, "INTEL_REPORT_PRIORITY", n, hardFail),
      buyer_hook: layer(`${contactName} owns revenue execution`, "JOB_CHANGE_SIGNAL", n + 500),
      pain: layer("manual account research is slowing outbound quality", "BUYER_PAIN_POINT", n + 1000, softFail),
      value: layer("FCP converts verified account signals into trustworthy outreach", "MASTER_CONTEXT_VALUE_PROP", n + 1500),
    },
    generation_metadata: {
      engine: tier === "TIER_1" ? "ANTHROPIC_CLAUDE" : "OPENAI_GPT_4O_MINI",
      model_version: tier === "TIER_1" ? "claude-sonnet-4" : "gpt-4o-mini",
      prompt_template_id: `${channel.toLowerCase()}_${tier.toLowerCase()}_v1`,
      generated_at: new Date("2026-05-02T08:30:00Z").toISOString(),
      token_usage: { input_tokens: 420, output_tokens: 120, estimated_cost_usd: tier === "TIER_1" ? 0.106 : 0.014 },
      generation_attempt: hardFail ? 3 : 1,
      diversity_signature: diversityFail ? "hash:collision" : `hash:${n}`,
    },
    validation_state: {
      traceability: hardFail ? "HARD_FAIL" : softFail ? "SOFT_FAIL" : "PASSED",
      traceability_failures: hardFail || softFail ? [{ layer: hardFail ? "account_hook" : "pain", reason: "Layer is untraced" }] : [],
      diversity: diversityFail ? "FAILED" : "PASSED",
      diversity_collision_with: diversityFail ? [id("msg", Math.max(1, n - 7))] : [],
      freshness: "PASSED",
      freshness_failures: [],
    },
    review_state: decisionFor(n) === "PENDING" ? "DRAFT_VALIDATED" : decisionFor(n),
    operator_edit_history: [],
    last_updated_at: new Date("2026-05-02T09:00:00Z").toISOString(),
  };
});

export const mockMessageReviews: MessageReview[] = mockCP3Messages.map((message, i) => {
  const decision = decisionFor(i + 1);
  return {
    message_id: message.message_id,
    review_decision: decision,
    operator_edits: decision === "EDITED" ? [{ layer: "body", before: "Old phrasing", after: message.body, edited_at: new Date().toISOString() }] : [],
    review_notes: decision === "REJECTED" ? "Needs a cleaner hook" : null,
    reviewed_at: decision === "PENDING" ? null : new Date("2026-05-02T10:00:00Z").toISOString(),
    opened_count: i < 210 ? 1 : 0,
  };
});

export const mockBuyerApprovals: BuyerApproval[] = Array.from({ length: 50 }, (_, i) => {
  const contactId = id("contact", i + 1);
  return {
    contact_id: contactId,
    account_domain: `account-${Math.ceil((i + 1) / 2)}.com`,
    all_messages_reviewed: i < 24,
    buyer_decision: i < 12 ? "APPROVED" : "PENDING",
    buyer_notes: null,
  };
});

function feedback(n: number, sentiment: FeedbackSentiment, resolved: boolean): ClientFeedback {
  return {
    feedback_id: id("feedback", n),
    message_id: n % 2 ? id("msg", n + 2) : null,
    feedback_text: sentiment === "CHANGE_REQUEST" ? "Please make this less assertive." : "This sample feels aligned.",
    sentiment,
    resolved,
    resolved_by: resolved ? "ops@sennen.io" : null,
    resolution_notes: resolved ? "Tone softened." : null,
    submitted_at: new Date("2026-05-02T11:00:00Z").toISOString(),
    resolved_at: resolved ? new Date("2026-05-02T11:30:00Z").toISOString() : null,
  };
}

export const mockCP3State: CP3ReviewState = {
  client_id: CLIENT_ID,
  status: "OPERATOR_REVIEW",
  opened_at: new Date("2026-05-02T09:00:00Z").toISOString(),
  operator_completed_at: null,
  client_share_sent_at: null,
  client_completed_at: null,
  approved_at: null,
  reviewer: "ops@sennen.io",
  client_share_token: MOCK_CP3_SHARE_TOKEN,
  client_share_email: "client@example.com",
  client_review_sample_ids: mockCP3Messages.slice(0, 5).map((m) => m.message_id),
  message_reviews: mockMessageReviews,
  buyer_approvals: mockBuyerApprovals,
  client_feedback: [feedback(1, "CHANGE_REQUEST", false), feedback(2, "NEGATIVE", false), feedback(3, "NEUTRAL", false), feedback(4, "CHANGE_REQUEST", false), feedback(5, "POSITIVE", true), feedback(6, "NEUTRAL", true)],
  aggregate_progress: {
    total_messages: 274,
    reviewed_messages: 138,
    approved_messages: 118,
    edited_messages: 14,
    regenerated_messages: 3,
    total_buyers: 50,
    approved_buyers: 12,
    client_feedback_total: 6,
    client_feedback_unresolved: 4,
  },
  blockers: [],
  messages: mockCP3Messages,
};

let mutableState: CP3ReviewState = structuredClone(mockCP3State);

function recalc(state: CP3ReviewState): CP3ReviewState {
  const reviewed = state.message_reviews.filter((r) => r.review_decision !== "PENDING");
  return {
    ...state,
    aggregate_progress: {
      ...state.aggregate_progress,
      reviewed_messages: reviewed.length,
      approved_messages: state.message_reviews.filter((r) => r.review_decision === "APPROVED").length,
      edited_messages: state.message_reviews.filter((r) => r.review_decision === "EDITED").length,
      regenerated_messages: state.message_reviews.filter((r) => r.review_decision === "REGENERATED").length,
      approved_buyers: state.buyer_approvals.filter((b) => b.buyer_decision === "APPROVED").length,
      client_feedback_total: state.client_feedback.length,
      client_feedback_unresolved: state.client_feedback.filter((f) => !f.resolved).length,
    },
  };
}

export function getMockCP3State(clientId: string) {
  return { ...mutableState, client_id: clientId };
}

export function reviewMockMessage(messageId: string, decision: MessageReviewDecision, edits?: { layer: string; before: string; after: string }[], notes?: string) {
  mutableState = recalc({
    ...mutableState,
    message_reviews: mutableState.message_reviews.map((review) =>
      review.message_id === messageId
        ? {
            ...review,
            review_decision: decision,
            operator_edits: edits?.map((edit) => ({ ...edit, edited_at: new Date().toISOString() })) ?? review.operator_edits,
            review_notes: notes ?? review.review_notes,
            reviewed_at: new Date().toISOString(),
          }
        : review,
    ),
    messages: mutableState.messages?.map((message) =>
      message.message_id === messageId && edits?.some((edit) => edit.layer === "body")
        ? { ...message, body: edits.find((edit) => edit.layer === "body")?.after ?? message.body }
        : message,
    ),
  });
  return mutableState.message_reviews.find((review) => review.message_id === messageId);
}

export function openMockMessage(messageId: string) {
  let count = 0;
  mutableState = {
    ...mutableState,
    message_reviews: mutableState.message_reviews.map((review) => {
      if (review.message_id !== messageId) return review;
      count = review.opened_count + 1;
      return { ...review, opened_count: count };
    }),
  };
  return { opened_count: count };
}

export function approveMockBuyer(contactId: string) {
  mutableState = recalc({
    ...mutableState,
    buyer_approvals: mutableState.buyer_approvals.map((buyer) =>
      buyer.contact_id === contactId
        ? { ...buyer, all_messages_reviewed: true, buyer_decision: "APPROVED" }
        : buyer,
    ),
  });
  return mutableState.buyer_approvals.find((buyer) => buyer.contact_id === contactId);
}

export function markMockOperatorComplete() {
  mutableState = { ...mutableState, status: "CLIENT_REVIEW", operator_completed_at: new Date().toISOString() };
  return mutableState;
}

export function sendMockToClient(email: string, sampleIds: string[]) {
  mutableState = {
    ...mutableState,
    status: "CLIENT_REVIEW",
    client_share_email: email,
    client_share_sent_at: new Date().toISOString(),
    client_review_sample_ids: sampleIds,
    client_share_token: MOCK_CP3_SHARE_TOKEN,
  };
  return { share_url: `http://localhost:5173/client-review/${MOCK_CP3_SHARE_TOKEN}`, email_status: "manual_send_required" };
}

export function resolveMockFeedback(feedbackId: string, notes: string) {
  mutableState = recalc({
    ...mutableState,
    client_feedback: mutableState.client_feedback.map((item) =>
      item.feedback_id === feedbackId
        ? { ...item, resolved: true, resolved_by: "ops@sennen.io", resolution_notes: notes, resolved_at: new Date().toISOString() }
        : item,
    ),
  });
  return mutableState.client_feedback.find((item) => item.feedback_id === feedbackId);
}

export function approveMockCP3() {
  mutableState = { ...mutableState, status: "APPROVED", approved_at: new Date().toISOString() };
  return mutableState;
}
