// @ts-nocheck
/**
 * Demo account — Growlytics (growlytics.io)
 *
 * A Series B B2B SaaS company that sells a revenue-intelligence platform
 * to mid-market SaaS companies. Scored 91/100 — Tier 1. 5-person buying
 * committee fully discovered. Includes a title mismatch, a job-change
 * signal, an operator-corrected role, and realistic pain-point inferences.
 *
 * This account is pinned at the top of the list and used in live demos.
 */

import type { AccountRecord } from "@/pages/Accounts/types";
import type { BuyerProfile, BuyersByDomainResponse } from "@/pages/Accounts/buyers/types";

// ─── Account record ─────────────────────────────────────────────────────────

export const DEMO_ACCOUNT_ID = "acct-demo-001";
export const DEMO_DOMAIN = "growlytics.io";

export const demoAccount: AccountRecord = {
  id: DEMO_ACCOUNT_ID,
  domain: DEMO_DOMAIN,
  company_name: "Growlytics",
  website: "https://growlytics.io",
  linkedin_url: "https://linkedin.com/company/growlytics",
  industry: "Revenue Intelligence",
  headcount: 210,
  estimated_arr: "$8M–$15M",
  funding_stage: "Series B",
  last_funding_round: {
    round: "Series B",
    amount_usd: 18_500_000,
    date: "2025-11-04",
  },
  hq_location: "Bangalore, India",
  technologies_used: ["HubSpot", "Salesforce", "Outreach", "Segment", "Snowflake", "Intercom"],
  recent_signals: [
    {
      type: "HIRING",
      description: "Posted 14 SDR and 3 RevOps roles in the last 30 days — scaling outbound motion after Series B close.",
      date: "2026-04-18",
      source_url: "https://linkedin.com/jobs/search/?keywords=Growlytics",
    },
    {
      type: "FUNDING",
      description: "Raised $18.5M Series B led by Peak XV Partners. Stated use of funds: GTM expansion and enterprise sales build-out.",
      date: "2025-11-04",
      source_url: "https://techcrunch.com/2025/11/04/growlytics-series-b",
    },
    {
      type: "EXPANSION",
      description: "Opened Singapore office — first move outside India, targeting SEA mid-market SaaS segment.",
      date: "2026-03-22",
      source_url: "https://growlytics.io/blog/singapore-expansion",
    },
    {
      type: "TECH_STACK",
      description: "BuiltWith detected HubSpot CRM + Outreach + Segment added in Q1 2026 — classic RevOps stack build-out.",
      date: "2026-02-10",
      source_url: "not_found",
    },
  ],
  icp_score: 91,
  score_breakdown: {
    industry: 25,     // Revenue Intelligence — exact vertical match
    company_size: 18, // 210 employees — ideal band
    geography: 14,    // Bangalore HQ — core geo
    tech_stack: 18,   // HubSpot + Outreach + Segment detected
    funding_stage: 9, // Series B, 5 months post-close — buying window open
    buying_triggers: 7,// Active SDR hiring + global expansion
  },
  tier: "TIER_1",
  source: "APOLLO",
  enriched_at: "2026-04-20T08:14:33.000Z",
};

// ─── Buying committee ────────────────────────────────────────────────────────

const DOMAIN = DEMO_DOMAIN;

export const demoBuyers: BuyerProfile[] = [
  // ── Decision-Maker ───────────────────────────────────────────────────────
  {
    contact_id: "demo-c001-priya-sharma",
    account_domain: DOMAIN,
    full_name: "Priya Sharma",
    first_name: "Priya",
    last_name: "Sharma",
    current_title: "Chief Revenue Officer",
    apollo_title: "Chief Revenue Officer",
    title_mismatch_flag: false,
    seniority: "C_SUITE",
    department: "Revenue",
    email: "priya.sharma@growlytics.io",
    email_status: "VALID",
    phone: "+91-98480-21034",
    linkedin_url: "https://linkedin.com/in/priya-sharma-cro",
    tenure_current_role_months: 22,
    tenure_current_company_months: 34,
    job_change_signal: false,
    committee_role: "DECISION_MAKER",
    committee_role_confidence: 0.95,
    committee_role_reasoning:
      "Title 'Chief Revenue Officer' contains a C-suite token — assigned DECISION_MAKER (exact match). She owns the entire revenue stack including SDR, AE, and RevOps. Series B hiring signal suggests she has budget authority.",
    inferred_pain_points: [
      {
        pain_point: "Pipeline predictability at scale post-Series B",
        reasoning:
          "CRO at a recently-funded company scaling outbound from 0 → 14 SDRs — pipeline forecasting gaps are a documented pain for this cohort. [INFERRED] from ICP pain point list + hiring signal.",
        confidence: 0.75,
        tag: "[INFERRED]",
      },
      {
        pain_point: "Inconsistent outbound conversion across SDR reps",
        reasoning:
          "Rapid SDR hiring without established playbooks correlates with rep-level conversion variance. [INFERRED] from ICP pain point list.",
        confidence: 0.65,
        tag: "[INFERRED]",
      },
      {
        pain_point: "CRM hygiene degrading as headcount grows",
        reasoning:
          "HubSpot + Salesforce dual-stack detected — dual-CRM environments are a known data-quality risk. [INFERRED] from tech-stack signal.",
        confidence: 0.60,
        tag: "[INFERRED]",
      },
    ],
    recent_activity: [],
    source: "APOLLO",
    enriched_at: "2026-04-20T08:14:33.000Z",
  },

  // ── Champion 1 ──────────────────────────────────────────────────────────
  {
    contact_id: "demo-c002-arjun-menon",
    account_domain: DOMAIN,
    full_name: "Arjun Menon",
    first_name: "Arjun",
    last_name: "Menon",
    current_title: "Head of Revenue Operations",
    apollo_title: "Revenue Operations Manager",   // Apollo hasn't caught the promotion
    title_mismatch_flag: true,
    seniority: "DIRECTOR",
    department: "Revenue Operations",
    email: "arjun.menon@growlytics.io",
    email_status: "VALID",
    phone: null,
    linkedin_url: "https://linkedin.com/in/arjun-menon-revops",
    tenure_current_role_months: 8,
    tenure_current_company_months: 20,
    job_change_signal: false,
    committee_role: "CHAMPION",
    committee_role_confidence: 0.95,
    committee_role_reasoning:
      "Title 'Head of Revenue Operations' exactly matches ICP buyer title 'Head of Revenue Operations' at Director level — assigned CHAMPION (exact match). RevOps owns the tooling decision and will be the primary evaluator.",
    inferred_pain_points: [
      {
        pain_point: "Manual reporting from disparate data sources",
        reasoning:
          "RevOps at a company with Snowflake + HubSpot + Salesforce integration — multi-stack reporting without a unified layer is a documented RevOps pain. [INFERRED] from tech-stack signal.",
        confidence: 0.70,
        tag: "[INFERRED]",
      },
      {
        pain_point: "SDR activity tracking as team scales from 3 → 14 reps",
        reasoning:
          "RevOps owns SDR tooling. Rapid team growth without standardised activity capture creates blind spots. [INFERRED] from hiring signal.",
        confidence: 0.65,
        tag: "[INFERRED]",
      },
    ],
    recent_activity: [],
    source: "APOLLO",
    enriched_at: "2026-04-20T08:14:33.000Z",
  },

  // ── Champion 2 ──────────────────────────────────────────────────────────
  {
    contact_id: "demo-c003-nisha-pillai",
    account_domain: DOMAIN,
    full_name: "Nisha Pillai",
    first_name: "Nisha",
    last_name: "Pillai",
    current_title: "VP of Sales",
    apollo_title: "VP of Sales",
    title_mismatch_flag: false,
    seniority: "VP",
    department: "Sales",
    email: "nisha.pillai@growlytics.io",
    email_status: "CATCH_ALL",
    phone: null,
    linkedin_url: "https://linkedin.com/in/nisha-pillai-vpsales",
    tenure_current_role_months: 5,
    tenure_current_company_months: 5,
    job_change_signal: true,   // Joined 5 months ago — strong outreach signal
    committee_role: "CHAMPION",
    committee_role_confidence: 0.70,
    committee_role_reasoning:
      "VP-level seniority with department 'Sales' aligned to ICP buyer titles ['VP Sales', 'Head of Sales'] — assigned CHAMPION (partial match). New VP hire is actively shaping the sales stack — high receptivity window.",
    inferred_pain_points: [
      {
        pain_point: "Inheriting a sales process built for a smaller team",
        reasoning:
          "New VP at a Series B company where the previous GTM was founder-led — inheritors typically audit and replace tooling in the first 6 months. [INFERRED] from tenure signal.",
        confidence: 0.70,
        tag: "[INFERRED]",
      },
      {
        pain_point: "No standardised outbound playbook across AE pod",
        reasoning:
          "VP with 5-month tenure during a hiring surge — playbook standardisation is a documented early priority. [INFERRED] from ICP pain point list.",
        confidence: 0.60,
        tag: "[INFERRED]",
      },
    ],
    recent_activity: [],
    source: "APOLLO",
    enriched_at: "2026-04-20T08:14:33.000Z",
  },

  // ── Blocker ──────────────────────────────────────────────────────────────
  {
    contact_id: "demo-c004-vikram-iyer",
    account_domain: DOMAIN,
    full_name: "Vikram Iyer",
    first_name: "Vikram",
    last_name: "Iyer",
    current_title: "Head of Finance & Procurement",
    apollo_title: "Finance Director",
    title_mismatch_flag: true,
    seniority: "DIRECTOR",
    department: "Finance",
    email: "vikram.iyer@growlytics.io",
    email_status: "VALID",
    phone: null,
    linkedin_url: "https://linkedin.com/in/vikram-iyer-finance",
    tenure_current_role_months: 30,
    tenure_current_company_months: 42,
    job_change_signal: false,
    committee_role: "BLOCKER",
    committee_role_confidence: 0.70,
    committee_role_reasoning:
      "Department 'Finance' is a known gate-keeping function and seniority rank=3 ≥ Director — assigned BLOCKER (partial match). Controls software procurement sign-off. Likely to push back on ACV unless ROI case is tight.",
    inferred_pain_points: [
      {
        pain_point: "Software spend control as headcount doubles post-Series B",
        reasoning:
          "Finance at a company that raised $18.5M and is actively hiring — procurement scrutiny on new tooling is higher than pre-funding. [INFERRED] from funding signal.",
        confidence: 0.65,
        tag: "[INFERRED]",
      },
    ],
    recent_activity: [],
    source: "APOLLO",
    enriched_at: "2026-04-20T08:14:33.000Z",
    // Operator manually corrected from BLOCKER → still BLOCKER, added a note
    _operator_edit_at: "2026-04-22T11:05:00.000Z",
    _operator_note: "Confirmed via LinkedIn: he owns both Finance and Procurement now. Title on Apollo is stale (pre-promotion). Treat as key blocker — needs ROI deck in advance of champion introduction.",
    manual_override_reason: "Apollo title is 6 months behind — he was promoted to Head of Finance & Procurement in Oct 2025. Verified on LinkedIn.",
  },

  // ── Influencer ────────────────────────────────────────────────────────────
  {
    contact_id: "demo-c005-sonal-krishna",
    account_domain: DOMAIN,
    full_name: "Sonal Krishna",
    first_name: "Sonal",
    last_name: "Krishna",
    current_title: "Senior SDR Manager",
    apollo_title: "Senior SDR Manager",
    title_mismatch_flag: false,
    seniority: "MANAGER",
    department: "Sales Development",
    email: "sonal.krishna@growlytics.io",
    email_status: "UNVERIFIED",
    phone: null,
    linkedin_url: "https://linkedin.com/in/sonal-krishna-sdr",
    tenure_current_role_months: 14,
    tenure_current_company_months: 26,
    job_change_signal: false,
    committee_role: "INFLUENCER",
    committee_role_confidence: 0.40,
    committee_role_reasoning:
      "No rule matched for title 'Senior SDR Manager' / department 'Sales Development' / seniority 'manager' — assigned INFLUENCER (inferred default). However, she manages the 14-person SDR team being built out — strong word-of-mouth influence on tooling decisions.",
    inferred_pain_points: [
      {
        pain_point: "Onboarding 14 new SDRs without documented process",
        reasoning:
          "SDR Manager during a 4× headcount expansion — ramping quality and speed is a documented pain. [INFERRED] from hiring signal.",
        confidence: 0.65,
        tag: "[INFERRED]",
      },
      {
        pain_point: "Sequence performance visibility across a growing rep pool",
        reasoning:
          "SDR Manager with Outreach detected in tech stack — sequence-level reporting gaps are a known pain as team scales. [INFERRED] from tech-stack signal.",
        confidence: 0.60,
        tag: "[INFERRED]",
      },
    ],
    recent_activity: [],
    source: "APOLLO",
    enriched_at: "2026-04-20T08:14:33.000Z",
  },
];

// ─── Response shapes ─────────────────────────────────────────────────────────

const _overrides: Record<string, Partial<BuyerProfile>> = {};

function applyOverrides(c: BuyerProfile): BuyerProfile {
  return _overrides[c.contact_id] ? { ...c, ..._overrides[c.contact_id] } : c;
}

export function getDemoBuyersByDomain(): BuyersByDomainResponse {
  const contacts = demoBuyers.map(applyOverrides);
  return { domain: DEMO_DOMAIN, contacts, total: contacts.length };
}

export function updateDemoContact(id: string, patch: Partial<BuyerProfile>): BuyerProfile | null {
  const base = demoBuyers.find((c) => c.contact_id === id);
  if (!base) return null;
  _overrides[id] = { ...(_overrides[id] ?? {}), ...patch };
  return applyOverrides(base);
}
