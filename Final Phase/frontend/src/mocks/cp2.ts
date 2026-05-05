// @ts-nocheck
import type {
  CP2AggregateProgress,
  CP2AuditRow,
  CP2ReviewState,
  InferredClaimReview,
  ReviewDecision,
} from "@/pages/Checkpoint2/types";

const CLIENT_ID = "12345678-1234-5678-1234-567812345678";

let store: CP2ReviewState = seed();
let auditLog: CP2AuditRow[] = [
  {
    id: crypto.randomUUID(),
    claim_id: null,
    account_domain: null,
    action: "OPEN_REVIEW",
    reviewer: "ops@sennen.io",
    before_state: null,
    after_state: { total_claims: 8, total_accounts: 3 },
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
];

function seed(): CP2ReviewState {
  const now = new Date().toISOString();
  const claims: InferredClaimReview[] = [
    {
      claim_id: crypto.randomUUID(),
      source_type: "BUYER_PAIN_POINT",
      account_domain: "acme.in",
      contact_id: crypto.randomUUID(),
      claim_text: "[INFERRED] Manual reconciliation slows month-end close",
      evidence_status: "INFERRED",
      reasoning: "Source: linkedin_post; confidence=0.78",
      review_decision: "APPROVED",
      corrected_text: null,
      review_notes: null,
      reviewed_at: now,
    },
    {
      claim_id: crypto.randomUUID(),
      source_type: "BUYER_PAIN_POINT",
      account_domain: "acme.in",
      contact_id: crypto.randomUUID(),
      claim_text: "[INFERRED] Lacks visibility into pipeline conversion",
      evidence_status: "INFERRED",
      reasoning: "Source: master_context; confidence=0.62",
      review_decision: "PENDING",
      corrected_text: null,
      review_notes: null,
      reviewed_at: null,
    },
    {
      claim_id: crypto.randomUUID(),
      source_type: "BUYER_PAIN_POINT",
      account_domain: "beta.io",
      contact_id: crypto.randomUUID(),
      claim_text: "[INFERRED] Sales team overwhelmed by manual prospecting",
      evidence_status: "INFERRED",
      reasoning: "Source: master_context; confidence=0.71",
      review_decision: "PENDING",
      corrected_text: null,
      review_notes: null,
      reviewed_at: null,
    },
    {
      claim_id: crypto.randomUUID(),
      source_type: "INTEL_REPORT_PRIORITY",
      account_domain: "acme.in",
      contact_id: null,
      claim_text: "Acme is investing heavily in payments infrastructure",
      evidence_status: "INFERRED",
      reasoning: "5 senior payments engineers hired in Q1 2026.",
      review_decision: "CORRECTED",
      corrected_text: "Acme is rebuilding its payments core in 2026",
      review_notes: null,
      reviewed_at: now,
    },
    {
      claim_id: crypto.randomUUID(),
      source_type: "INTEL_REPORT_PRIORITY",
      account_domain: "acme.in",
      contact_id: null,
      claim_text: "International expansion is a stated priority",
      evidence_status: "INFERRED",
      reasoning: "EU and APAC job postings tripled QoQ.",
      review_decision: "PENDING",
      corrected_text: null,
      review_notes: null,
      reviewed_at: null,
    },
    {
      claim_id: crypto.randomUUID(),
      source_type: "INTEL_REPORT_COMPETITOR",
      account_domain: "acme.in",
      contact_id: null,
      claim_text: "Rival Inc",
      evidence_status: "INFERRED",
      reasoning: "Cross-followed on LinkedIn, mentioned in G2 reviews.",
      review_decision: "PENDING",
      corrected_text: null,
      review_notes: null,
      reviewed_at: null,
    },
    {
      claim_id: crypto.randomUUID(),
      source_type: "INTEL_REPORT_PAIN",
      account_domain: "acme.in",
      contact_id: null,
      claim_text: "Manual reporting pipeline blocking analytics initiatives",
      evidence_status: "INFERRED",
      reasoning: "Job postings consistently mention Excel-based reporting.",
      review_decision: "REMOVED",
      corrected_text: null,
      review_notes: "Already covered by buyer-level pain claim",
      reviewed_at: now,
    },
    {
      claim_id: crypto.randomUUID(),
      source_type: "INTEL_REPORT_PAIN",
      account_domain: "gamma.co",
      contact_id: null,
      claim_text: "Analytics team understaffed for current scale",
      evidence_status: "INFERRED",
      reasoning: "Open role for VP Analytics for >90 days.",
      review_decision: "PENDING",
      corrected_text: null,
      review_notes: null,
      reviewed_at: null,
    },
  ];

  const aggregate: CP2AggregateProgress = recompute(claims, [
    { domain: "acme.in", tier1: true },
    { domain: "beta.io", tier1: false },
    { domain: "gamma.co", tier1: false },
  ]);

  return {
    client_id: CLIENT_ID,
    status: "IN_REVIEW",
    opened_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    approved_at: null,
    reviewer: "ops@sennen.io",
    reviewer_notes: null,
    inferred_claims_review: claims,
    account_approvals: [
      {
        account_domain: "acme.in",
        buyer_profiles_approved: false,
        intel_report_approved: false,
        account_decision: "PENDING",
        account_notes: null,
      },
      {
        account_domain: "beta.io",
        buyer_profiles_approved: false,
        intel_report_approved: null,
        account_decision: "PENDING",
        account_notes: null,
      },
      {
        account_domain: "gamma.co",
        buyer_profiles_approved: false,
        intel_report_approved: null,
        account_decision: "PENDING",
        account_notes: null,
      },
    ],
    aggregate_progress: aggregate,
    blockers: blockersFor(claims, [
      { domain: "acme.in" },
      { domain: "beta.io" },
      { domain: "gamma.co" },
    ]),
  };
}

function recompute(
  claims: InferredClaimReview[],
  accounts: { domain: string; tier1: boolean }[],
): CP2AggregateProgress {
  const approved = claims.filter((c) => c.review_decision === "APPROVED").length;
  const corrected = claims.filter((c) => c.review_decision === "CORRECTED").length;
  const removed = claims.filter((c) => c.review_decision === "REMOVED").length;
  return {
    total_inferred_claims: claims.length,
    reviewed_claims: approved + corrected + removed,
    approved_claims: approved,
    corrected_claims: corrected,
    removed_claims: removed,
    total_accounts: accounts.length,
    approved_accounts: 0,
    removed_accounts: 0,
  };
}

function blockersFor(
  claims: InferredClaimReview[],
  accounts: { domain: string }[],
) {
  const result: CP2ReviewState["blockers"] = [];
  const pending = claims.filter((c) => c.review_decision === "PENDING").length;
  if (pending > 0) {
    result.push({
      type: "UNREVIEWED_CLAIMS",
      message: `${pending} ${pending === 1 ? "claim" : "claims"} still pending review`,
    });
  }
  if (accounts.length > 0) {
    result.push({
      type: "UNAPPROVED_ACCOUNTS",
      message: `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"} not yet approved or removed`,
    });
  }
  return result;
}

function pushAudit(action: string, claimId: string | null, domain: string | null, before: unknown, after: unknown) {
  auditLog = [
    ...auditLog,
    {
      id: crypto.randomUUID(),
      claim_id: claimId,
      account_domain: domain,
      action,
      reviewer: store.reviewer,
      before_state: before,
      after_state: after,
      timestamp: new Date().toISOString(),
    },
  ];
}

function refreshAggregate() {
  const approved = store.inferred_claims_review.filter((c) => c.review_decision === "APPROVED").length;
  const corrected = store.inferred_claims_review.filter((c) => c.review_decision === "CORRECTED").length;
  const removed = store.inferred_claims_review.filter((c) => c.review_decision === "REMOVED").length;
  const approvedAccounts = store.account_approvals.filter((a) => a.account_decision === "APPROVED").length;
  const removedAccounts = store.account_approvals.filter((a) => a.account_decision === "REMOVED_FROM_PIPELINE").length;
  store.aggregate_progress = {
    total_inferred_claims: store.inferred_claims_review.length,
    reviewed_claims: approved + corrected + removed,
    approved_claims: approved,
    corrected_claims: corrected,
    removed_claims: removed,
    total_accounts: store.account_approvals.length,
    approved_accounts: approvedAccounts,
    removed_accounts: removedAccounts,
  };

  const blockers: CP2ReviewState["blockers"] = [];
  const pending = store.inferred_claims_review.filter((c) => c.review_decision === "PENDING").length;
  if (pending > 0) {
    blockers.push({
      type: "UNREVIEWED_CLAIMS",
      message: `${pending} ${pending === 1 ? "claim" : "claims"} still pending review`,
    });
  }
  const pendingAccounts = store.account_approvals.filter((a) => a.account_decision === "PENDING").length;
  if (pendingAccounts > 0) {
    blockers.push({
      type: "UNAPPROVED_ACCOUNTS",
      message: `${pendingAccounts} ${pendingAccounts === 1 ? "account" : "accounts"} not yet approved or removed`,
    });
  }
  store.blockers = blockers;
}

export function getMockCP2State(): CP2ReviewState {
  return store;
}

export function reviewMockClaim(
  claimId: string,
  decision: ReviewDecision,
  correctedText: string | null,
  reviewNotes: string | null,
): CP2ReviewState | null {
  const idx = store.inferred_claims_review.findIndex((c) => c.claim_id === claimId);
  if (idx === -1) return null;
  if (decision === "CORRECTED" && !correctedText?.trim()) {
    throw new Error("CORRECTED requires corrected_text");
  }
  const before = { ...store.inferred_claims_review[idx] };
  const updated: InferredClaimReview = {
    ...before,
    review_decision: decision,
    corrected_text: decision === "CORRECTED" ? correctedText : null,
    review_notes: reviewNotes,
    reviewed_at: decision === "PENDING" ? null : new Date().toISOString(),
  };
  store.inferred_claims_review = [
    ...store.inferred_claims_review.slice(0, idx),
    updated,
    ...store.inferred_claims_review.slice(idx + 1),
  ];
  refreshAggregate();
  pushAudit(`REVIEW_CLAIM_${decision}`, claimId, before.account_domain, before, updated);
  return store;
}

export function approveMockAccount(domain: string, notes: string | null): CP2ReviewState | null {
  const idx = store.account_approvals.findIndex((a) => a.account_domain === domain);
  if (idx === -1) return null;
  const pending = store.inferred_claims_review.filter(
    (c) => c.account_domain === domain && c.review_decision === "PENDING",
  ).length;
  if (pending > 0) {
    throw new Error(`account ${domain} has ${pending} claims still pending`);
  }
  const before = { ...store.account_approvals[idx] };
  const updated = {
    ...before,
    account_decision: "APPROVED" as const,
    buyer_profiles_approved: true,
    intel_report_approved: before.intel_report_approved !== null ? true : null,
    account_notes: notes,
  };
  store.account_approvals = [
    ...store.account_approvals.slice(0, idx),
    updated,
    ...store.account_approvals.slice(idx + 1),
  ];
  refreshAggregate();
  pushAudit("APPROVE_ACCOUNT", null, domain, before, updated);
  return store;
}

export function removeMockAccount(domain: string, reason: string): CP2ReviewState | null {
  const idx = store.account_approvals.findIndex((a) => a.account_domain === domain);
  if (idx === -1) return null;
  const before = { ...store.account_approvals[idx] };
  const updated = {
    ...before,
    account_decision: "REMOVED_FROM_PIPELINE" as const,
    buyer_profiles_approved: false,
    account_notes: reason,
  };
  store.account_approvals = [
    ...store.account_approvals.slice(0, idx),
    updated,
    ...store.account_approvals.slice(idx + 1),
  ];
  refreshAggregate();
  pushAudit("REMOVE_ACCOUNT", null, domain, before, updated);
  return store;
}

export function approveMockCP2(reviewerNotes: string | null): { ok: true; state: CP2ReviewState } | { ok: false; state: CP2ReviewState } {
  if (store.blockers.length > 0) {
    return { ok: false, state: store };
  }
  store.status = "APPROVED";
  store.approved_at = new Date().toISOString();
  store.reviewer_notes = reviewerNotes;
  pushAudit("APPROVE_CP2", null, null, { status: "IN_REVIEW" }, { status: "APPROVED" });
  return { ok: true, state: store };
}

export function rejectMockCP2(reason: string): CP2ReviewState {
  store.status = "REJECTED";
  store.approved_at = null;
  store.reviewer_notes = reason;
  pushAudit("REJECT_CP2", null, null, { status: "IN_REVIEW" }, { status: "REJECTED", reason });
  return store;
}

export function getMockCP2AuditLog(): CP2AuditRow[] {
  return auditLog;
}
