// @ts-nocheck
import type {
  EmailFinalStatus,
  VerifiedDataPackage,
  VerificationResult,
  VerificationSource,
} from "@/pages/Accounts/verification/types";
import { MOCK_BUYER_CLIENT_ID } from "./buyers";

const NOW = new Date("2026-04-29T10:00:00Z").toISOString();
const TWO_HOURS_AGO = new Date("2026-04-29T08:00:00Z").toISOString();

interface MockContactSeed {
  contact_id: string;
  account_domain: string;
  display_name: string;
  committee_role: string;
  source: VerificationSource;
  final_status: EmailFinalStatus;
  score: number;
  apollo_title: string;
  resolved_title?: string;
  mismatchResolved?: boolean;
  primaryStatus?: EmailFinalStatus;
  secondaryStatus?: EmailFinalStatus | null;
  relookup?: "success" | "quota";
  jobConfidence?: number;
}

function engineResult(status: EmailFinalStatus, confidence: number, subStatus = "") {
  return {
    status,
    confidence,
    sub_status: subStatus,
    checked_at: TWO_HOURS_AGO,
  };
}

function issueFor(seed: MockContactSeed) {
  const issues: VerificationResult["issues"] = [];
  if (!seed.mismatchResolved) {
    issues.push({
      severity: "WARNING",
      code: "TITLE_RECONCILIATION_PENDING",
      message: "Title reconciliation pending - Phase 5 will resolve via PhantomBuster.",
    });
  }
  if (seed.final_status === "RISKY" || seed.final_status === "CATCH_ALL") {
    issues.push({
      severity: "WARNING",
      code: `EMAIL_${seed.final_status}`,
      message: `Email verification final_status=${seed.final_status}; do not treat as VALID.`,
    });
  }
  if (seed.relookup === "quota") {
    issues.push({
      severity: "WARNING",
      code: "HUNTER_RELOOKUP_BLOCKED",
      message: "Hunter relookup blocked: QUOTA_EXHAUSTED.",
    });
  }
  return issues;
}

function makeVerification(seed: MockContactSeed): VerificationResult {
  const primaryStatus = seed.primaryStatus ?? seed.final_status;
  const secondaryStatus = seed.secondaryStatus ?? null;
  const hasSecondary = secondaryStatus !== null;
  const relookupEmail = seed.relookup === "success"
    ? `verified.${seed.display_name.toLowerCase().replace(/\s+/g, ".")}@${seed.account_domain}`
    : null;

  return {
    contact_id: seed.contact_id,
    account_domain: seed.account_domain,
    display_name: seed.display_name,
    committee_role: seed.committee_role,
    source: seed.source,
    email_verification: {
      email: `${seed.display_name.toLowerCase().replace(/\s+/g, ".")}@${seed.account_domain}`,
      status: primaryStatus,
      primary_engine: "NEVERBOUNCE",
      secondary_engine: hasSecondary ? "ZEROBOUNCE" : null,
      primary_result: engineResult(
        primaryStatus,
        primaryStatus === "CATCH_ALL" ? 0.42 : primaryStatus === "RISKY" ? 0.51 : 0.93,
      ),
      secondary_result: hasSecondary ? engineResult(secondaryStatus, secondaryStatus === "VALID" ? 0.91 : 0.64) : null,
      relookup_attempted: Boolean(seed.relookup),
      relookup_source: seed.relookup ? "HUNTER" : null,
      relookup_email: relookupEmail,
      relookup_blocked_reason: seed.relookup === "quota" ? "QUOTA_EXHAUSTED" : null,
      final_status: seed.final_status,
    },
    linkedin_check: {
      url: `https://linkedin.com/in/${seed.display_name.toLowerCase().replace(/\s+/g, "-")}`,
      reachable: true,
      http_status: 200,
      check_authoritative: true,
      checked_at: TWO_HOURS_AGO,
    },
    website_check: {
      domain: seed.account_domain,
      reachable: true,
      http_status: 200,
      checked_at: TWO_HOURS_AGO,
    },
    title_reconciliation: {
      apollo_title: seed.apollo_title,
      linkedin_title: seed.mismatchResolved ? seed.resolved_title ?? seed.apollo_title : null,
      resolved_title: seed.resolved_title ?? seed.apollo_title,
      resolution_method: seed.mismatchResolved ? "LINKEDIN_PRIMARY" : "APOLLO_FALLBACK",
      mismatch_resolved: Boolean(seed.mismatchResolved),
    },
    job_change_verification: {
      apollo_claimed: true,
      linkedin_confirmed: seed.jobConfidence && seed.jobConfidence >= 0.9 ? true : null,
      verified: true,
      confidence: seed.jobConfidence ?? 0.6,
    },
    overall_data_quality_score: seed.score,
    issues: issueFor(seed),
    verified_at: TWO_HOURS_AGO,
  };
}

const seeds: MockContactSeed[] = [
  {
    contact_id: "c1000-0001-0000-0000-000000000001",
    account_domain: "signal-1.example.com",
    display_name: "Priya Menon",
    committee_role: "DECISION_MAKER",
    source: "apollo",
    final_status: "VALID",
    score: 92,
    apollo_title: "Chief Revenue Officer",
    mismatchResolved: true,
    jobConfidence: 0.95,
  },
  {
    contact_id: "c1000-0001-0000-0000-000000000002",
    account_domain: "signal-1.example.com",
    display_name: "Arjun Sharma",
    committee_role: "CHAMPION",
    source: "apollo",
    final_status: "VALID",
    primaryStatus: "CATCH_ALL",
    secondaryStatus: "VALID",
    score: 85,
    apollo_title: "Director of Sales",
    resolved_title: "Director of Sales",
    mismatchResolved: false,
  },
  {
    contact_id: "c1000-0001-0000-0000-000000000003",
    account_domain: "signal-1.example.com",
    display_name: "Nandini Krishnan",
    committee_role: "CHAMPION",
    source: "apollo",
    final_status: "CATCH_ALL",
    primaryStatus: "CATCH_ALL",
    secondaryStatus: "CATCH_ALL",
    score: 75,
    apollo_title: "Head of Sales Enablement",
    mismatchResolved: false,
  },
  {
    contact_id: "c1000-0001-0000-0000-000000000004",
    account_domain: "signal-1.example.com",
    display_name: "Vikram Patel",
    committee_role: "BLOCKER",
    source: "apollo",
    final_status: "VALID",
    score: 86,
    apollo_title: "Finance Director",
    resolved_title: "Director of Finance",
    mismatchResolved: true,
  },
  {
    contact_id: "c1000-0001-0000-0000-000000000005",
    account_domain: "signal-1.example.com",
    display_name: "Sonal Gupta",
    committee_role: "INFLUENCER",
    source: "apollo",
    final_status: "VALID",
    score: 82,
    apollo_title: "Senior Marketing Manager",
    mismatchResolved: true,
  },
  {
    contact_id: "c1000-0002-0000-0000-000000000001",
    account_domain: "signal-2.example.com",
    display_name: "Rahul Verma",
    committee_role: "DECISION_MAKER",
    source: "clay",
    final_status: "RISKY",
    primaryStatus: "RISKY",
    secondaryStatus: "RISKY",
    score: 66,
    apollo_title: "CEO",
    mismatchResolved: true,
  },
  {
    contact_id: "c1000-0002-0000-0000-000000000002",
    account_domain: "signal-2.example.com",
    display_name: "Deepa Nair",
    committee_role: "CHAMPION",
    source: "hunter",
    final_status: "VALID",
    primaryStatus: "INVALID",
    relookup: "success",
    score: 81,
    apollo_title: "VP Marketing",
    mismatchResolved: true,
  },
  {
    contact_id: "c1000-0002-0000-0000-000000000003",
    account_domain: "signal-2.example.com",
    display_name: "Anil Kumar",
    committee_role: "BLOCKER",
    source: "hunter",
    final_status: "INVALID",
    primaryStatus: "INVALID",
    relookup: "quota",
    score: 42,
    apollo_title: "IT Security Manager",
    mismatchResolved: true,
  },
];

for (let i = 0; i < 17; i += 1) {
  seeds.push({
    contact_id: `c9000-00${String(i).padStart(2, "0")}-0000-0000-000000000000`,
    account_domain: `signal-${3 + (i % 8)}.example.com`,
    display_name: `Verified Contact ${i + 1}`,
    committee_role: i % 4 === 0 ? "DECISION_MAKER" : "CHAMPION",
    source: i % 5 === 0 ? "clay" : i % 7 === 0 ? "hunter" : "apollo",
    final_status: "VALID",
    score: 80 + (i % 12),
    apollo_title: i % 4 === 0 ? "VP Revenue" : "Sales Director",
    mismatchResolved: true,
  });
}

let mockPackage: VerifiedDataPackage = {
  client_id: MOCK_BUYER_CLIENT_ID,
  generated_at: NOW,
  verifications: seeds.map(makeVerification),
  per_source_breakdown: {
    apollo: { total: 50, valid: 38, invalid: 12, pass_rate: 0.76 },
    clay: { total: 20, valid: 18, invalid: 2, pass_rate: 0.9 },
    hunter: { total: 12, valid: 8, invalid: 4, pass_rate: 0.67 },
    linkedin_manual: null,
  },
  aggregate: {
    total_contacts: 25,
    valid_emails: 22,
    invalid_emails: 1,
    catch_all: 1,
    risky: 1,
    not_found: 0,
    deliverability_rate: 0.88,
    linkedin_reachable_rate: 0.96,
    linkedin_authoritative_rate: 0.92,
    website_reachable_rate: 1,
    title_mismatches_resolved: 23,
    job_changes_verified: 25,
  },
  quota_usage: {
    neverbounce_used_this_run: 25,
    zerobounce_used_this_run: 3,
    hunter_used_this_run: 2,
    neverbounce_remaining: 577,
    zerobounce_remaining: 33,
    hunter_remaining: 1,
  },
  meets_deliverability_target: false,
  target_miss_diagnosis:
    "Deliverability 88% missed 90% target. Lowest-quality source: hunter at 67% (4 of 12 invalid). Recommended: Reduce Hunter re-lookup volume; quota exhaustion correlates with stale data.",
};

export function getMockVerificationPackage(clientId: string | null) {
  if (clientId && clientId !== MOCK_BUYER_CLIENT_ID) return null;
  return mockPackage;
}

export function getMockVerificationByContact(contactId: string) {
  return mockPackage.verifications.find((verification) => verification.contact_id === contactId) ?? null;
}

export function recheckMockContact(contactId: string) {
  const verification = getMockVerificationByContact(contactId);
  if (!verification) return null;
  const next = {
    ...verification,
    verified_at: new Date().toISOString(),
    issues: verification.issues.filter((issue) => issue.code !== "RECHECK_QUEUED"),
  };
  mockPackage = {
    ...mockPackage,
    verifications: mockPackage.verifications.map((row) =>
      row.contact_id === contactId ? next : row,
    ),
  };
  return {
    job_id: `job-verify-${Math.random().toString(36).slice(2, 10)}`,
    status: "queued",
    message: `Verification re-check queued for contact_id=${contactId}.`,
  };
}

export function resetMockVerificationState() {
  mockPackage = {
    ...mockPackage,
    generated_at: NOW,
    verifications: seeds.map(makeVerification),
  };
}
