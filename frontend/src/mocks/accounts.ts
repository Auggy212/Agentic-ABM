import type { AccountRecord, AccountsListResponse, AccountTier, DataSource, RunStatus } from "@/pages/Accounts/types";

export const MOCK_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

const SOURCE_LABELS: DataSource[] = ["APOLLO", "HARMONIC", "CRUNCHBASE", "BUILTWITH", "CLIENT_UPLOAD"];
const INDUSTRIES = [
  "Vertical SaaS",
  "Fintech Infrastructure",
  "Healthtech Ops",
  "Cybersecurity",
  "Developer Tools",
  "Revenue Intelligence",
];
const LOCATIONS = [
  "San Francisco, USA",
  "New York, USA",
  "Toronto, Canada",
  "London, UK",
  "Berlin, Germany",
  "Singapore",
];
const FUNDING_STAGES = ["Seed", "Series A", "Series B", "Growth", "Enterprise"];
const TECHNOLOGY_STACKS = [
  ["Salesforce", "HubSpot", "Segment"],
  ["Snowflake", "dbt", "Looker"],
  ["Stripe", "Intercom", "Zendesk"],
  ["Marketo", "Clearbit", "Outreach"],
  ["Apollo", "Clay", "HubSpot"],
];
const SIGNAL_TYPES = ["FUNDING", "HIRING", "TECH_STACK", "EXPANSION"];

function tierFromScore(score: number): AccountTier {
  if (score >= 80) {
    return "TIER_1";
  }
  if (score >= 60) {
    return "TIER_2";
  }
  return "TIER_3";
}

function scoreBreakdown(score: number) {
  const industry = Math.min(25, Math.max(5, Math.round(score * 0.25)));
  const companySize = Math.min(20, Math.max(4, Math.round(score * 0.2)));
  const geography = Math.min(15, Math.max(2, Math.round(score * 0.15)));
  const techStack = Math.min(20, Math.max(3, Math.round(score * 0.2)));
  const fundingStage = Math.min(10, Math.max(1, Math.round(score * 0.1)));
  const buyingTriggers = Math.max(0, score - industry - companySize - geography - techStack - fundingStage);

  return {
    industry,
    company_size: companySize,
    geography,
    tech_stack: techStack,
    funding_stage: fundingStage,
    buying_triggers: Math.min(10, buyingTriggers),
  };
}

function buildSignal(index: number, offset: number) {
  const type = SIGNAL_TYPES[(index + offset) % SIGNAL_TYPES.length];
  const month = String(((index + offset) % 9) + 1).padStart(2, "0");
  const day = String(((index * 3 + offset) % 28) + 1).padStart(2, "0");
  return {
    type,
    description: `${type.toLowerCase()} signal detected from source crawl ${offset + 1}`,
    date: `2026-${month}-${day}`,
    source_url: `https://signals.example.com/${index + 1}/${offset + 1}`,
  };
}

function buildAccount(index: number): AccountRecord {
  const scoreBand = index % 3;
  const score = scoreBand === 0 ? 84 + (index % 15) : scoreBand === 1 ? 62 + (index % 14) : 38 + (index % 20);
  const source = SOURCE_LABELS[index % SOURCE_LABELS.length];
  const technologies = TECHNOLOGY_STACKS[index % TECHNOLOGY_STACKS.length];
  const domain = `signal-${index + 1}.example.com`;

  return {
    id: `acct-${String(index + 1).padStart(3, "0")}`,
    domain,
    company_name: `SignalWorks ${index + 1}`,
    website: `https://${domain}`,
    linkedin_url: `https://linkedin.com/company/signalworks-${index + 1}`,
    industry: INDUSTRIES[index % INDUSTRIES.length],
    headcount: index === 7 ? "not_found" : 45 + index * 17,
    estimated_arr: index % 4 === 0 ? "$1M-$5M" : index % 4 === 1 ? "$5M-$20M" : "$20M-$75M",
    funding_stage: FUNDING_STAGES[index % FUNDING_STAGES.length],
    last_funding_round: {
      round: FUNDING_STAGES[index % FUNDING_STAGES.length],
      amount_usd: 1_500_000 + index * 250_000,
      date: `2025-${String((index % 12) + 1).padStart(2, "0")}-15`,
    },
    hq_location: LOCATIONS[index % LOCATIONS.length],
    technologies_used: technologies,
    recent_signals: [buildSignal(index, 0), buildSignal(index, 1), buildSignal(index, 2)],
    icp_score: Math.min(score, 99),
    score_breakdown: scoreBreakdown(Math.min(score, 99)),
    tier: tierFromScore(Math.min(score, 99)),
    source,
    enriched_at: new Date(Date.UTC(2026, (index % 6) + 1, (index % 26) + 1, 10, 30, 0)).toISOString(),
  };
}

const baseAccounts = Array.from({ length: 56 }, (_, index) => buildAccount(index));

const state = {
  removedIds: new Set<string>(),
  runStatus: "needs_review" as RunStatus,
};

function activeAccounts() {
  return baseAccounts.filter((account) => !state.removedIds.has(account.id));
}

function computeMeta(accounts: AccountRecord[]) {
  return {
    total_found: accounts.length,
    tier_breakdown: {
      tier_1: accounts.filter((account) => account.tier === "TIER_1").length,
      tier_2: accounts.filter((account) => account.tier === "TIER_2").length,
      tier_3: accounts.filter((account) => account.tier === "TIER_3").length,
    },
    generated_at: new Date("2026-04-25T10:30:00.000Z").toISOString(),
    client_id: MOCK_CLIENT_ID,
    run_status: state.runStatus,
    quota_warnings: [
      "Apollo quota exhausted mid-run, 47 of 200 queries completed.",
    ],
    flagged_accounts: accounts.filter((account) => account.tier !== "TIER_1").length,
    phase_2_locked: state.runStatus !== "approved",
    share_token: null,
  };
}

export function resetMockAccountsState() {
  state.removedIds.clear();
  state.runStatus = "needs_review";
}

export function listMockAccounts(params: URLSearchParams): AccountsListResponse {
  const search = params.get("search")?.trim().toLowerCase() ?? "";
  const tier = params.get("tier");
  const minScore = Number(params.get("min_score") ?? "0");
  const maxScore = Number(params.get("max_score") ?? "100");
  const sourceFilter = new Set((params.get("source") ?? "").split(",").filter(Boolean));
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("page_size") ?? "100");

  const filtered = activeAccounts().filter((account) => {
    const matchesSearch =
      search.length === 0 ||
      account.company_name.toLowerCase().includes(search) ||
      account.domain.toLowerCase().includes(search);
    const matchesTier = !tier || account.tier === tier;
    const matchesScore = account.icp_score >= minScore && account.icp_score <= maxScore;
    const matchesSource = sourceFilter.size === 0 || sourceFilter.has(account.source);
    return matchesSearch && matchesTier && matchesScore && matchesSource;
  });

  const start = (page - 1) * pageSize;
  const accounts = filtered.slice(start, start + pageSize);

  return {
    accounts,
    total: filtered.length,
    page,
    page_size: pageSize,
    meta: computeMeta(filtered),
  };
}

export function getMockAccount(id: string) {
  return activeAccounts().find((account) => account.id === id) ?? null;
}

export function removeMockAccount(id: string, reason: string | null) {
  const account = getMockAccount(id);
  if (!account) {
    return null;
  }

  state.removedIds.add(id);
  return {
    account_id: id,
    status: "removed" as const,
    reason,
  };
}

export function approveMockCheckpoint() {
  state.runStatus = "approved";
  return {
    checkpoint: 1,
    status: "approved" as const,
    approved_at: new Date().toISOString(),
  };
}
