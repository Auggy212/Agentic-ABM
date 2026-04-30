import type { SignalReport, AccountSignal, IntelReport } from "@/pages/Accounts/signals/types";

const MOCK_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

function sig(
  id: string,
  type: AccountSignal["type"],
  intent: AccountSignal["intent_level"],
  source: AccountSignal["source"],
  desc: string,
  snippet: string,
  daysAgo: number,
): AccountSignal {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    signal_id: `sig-${id}`,
    type,
    intent_level: intent,
    description: desc,
    source,
    source_url: `https://example.com/signal/${id}`,
    detected_at: d.toISOString(),
    evidence_snippet: snippet,
  };
}

const MOCK_INTEL_REPORT: IntelReport = {
  company_snapshot:
    "[VERIFIED] Signal-1 Corp raised a $40M Series B in March 2026 (Crunchbase). " +
    "[INFERRED] Based on their recent hiring patterns in RevOps and Sales, they appear to be scaling " +
    "a go-to-market motion targeting mid-market SaaS companies.",
  strategic_priorities: [
    {
      priority: "Accelerate APAC expansion through channel partnerships",
      evidence: "[VERIFIED] Announced APAC expansion and two strategic partnership deals in Q1 2026.",
      evidence_status: "VERIFIED",
      source_url: "https://example.com/news/apac-expansion",
    },
    {
      priority: "Build out PLG (product-led growth) motion alongside existing enterprise sales",
      evidence: "[INFERRED] Hiring for Growth and PLG roles suggests a dual-track strategy.",
      evidence_status: "INFERRED",
      source_url: "not_found",
    },
    {
      priority: "Consolidate tech stack post-acquisition",
      evidence: "[VERIFIED] CTO blog post referenced tech-stack rationalization post Series B.",
      evidence_status: "VERIFIED",
      source_url: "https://example.com/blog/tech-stack",
    },
  ],
  tech_stack: ["Salesforce", "HubSpot", "Outreach", "Gong", "Slack", "AWS"],
  competitive_landscape: [
    {
      competitor_name: "CompetitorX",
      evidence: "[VERIFIED] G2 reviewer from Signal-1 Corp left a review on CompetitorX in February 2026.",
      evidence_status: "VERIFIED",
      source_url: "https://www.g2.com/products/competitorx",
    },
    {
      competitor_name: "LegacyVendor Inc.",
      evidence: "[INFERRED] Current tech stack includes LegacyVendor tools; likely evaluating replacements given Series B investment.",
      evidence_status: "INFERRED",
      source_url: "not_found",
    },
  ],
  inferred_pain_points: [
    {
      pain_point: "Manual prospecting and low outbound conversion rate",
      evidence_status: "INFERRED",
      reasoning:
        "VP Sales title alignment with ICP pain points around pipeline efficiency. LinkedIn activity not available in Phase 2 — confidence ceiling limited.",
    },
    {
      pain_point: "Poor CRM data quality leading to inaccurate forecasting",
      evidence_status: "INFERRED",
      reasoning: "RevOps hiring signals suggest active data quality problems.",
    },
  ],
  recent_news: [
    {
      headline: "Signal-1 Corp raises $40M Series B led by Accel",
      date: "2026-03-15",
      source_url: "https://techcrunch.com/signal-1-series-b",
      summary: "B2B SaaS company closes $40M Series B to accelerate GTM and product expansion.",
    },
    {
      headline: "Signal-1 Corp announces APAC expansion with 3 new regional hires",
      date: "2026-04-01",
      source_url: "https://businesswire.com/signal-1-apac",
      summary: "Company enters Singapore, Australia, and India markets.",
    },
    {
      headline: "New CRO joins Signal-1 Corp from Salesforce",
      date: "2026-04-10",
      source_url: "https://linkedin.com/news/signal-1-cro",
      summary: "Former Salesforce VP Revenue joins as Chief Revenue Officer.",
    },
  ],
  buying_committee_summary:
    "The buying committee at Signal-1 Corp is led by Priya Menon (CRO, Decision-Maker) with Arjun Sharma (Champion, VP Sales) as the primary internal advocate. Vikram Patel (Finance Director) is identified as a likely Blocker requiring ROI justification.",
  recommended_angle:
    "Lead with the new CRO's Series B mandate to build a scalable outbound motion. Position as the intelligence layer that makes their RevOps investment pay off faster — show ROI within the first quarter.",
  generated_by: { researcher: "perplexity", synthesizer: "claude-sonnet-4" },
  generated_at: new Date("2026-04-20T12:00:00Z").toISOString(),
};

const signalData: Record<string, SignalReport> = {
  "signal-1.example.com": {
    account_domain: "signal-1.example.com",
    tier: "TIER_1",
    signals: [
      sig("s1-1", "FUNDING", "HIGH", "CRUNCHBASE", "Raised $40M Series B — actively investing in new tooling", "Series B of $40M announced March 2026.", 15),
      sig("s1-2", "RELEVANT_HIRE", "HIGH", "LINKEDIN_JOBS", "Hiring VP Revenue Operations — ICP-aligned role open", "Open role at signal-1.example.com: VP Revenue Operations", 8),
      sig("s1-3", "COMPETITOR_REVIEW", "HIGH", "G2", "Employee reviewed CompetitorX on G2", "G2 search returned 3 mentions. Competitor evaluation activity detected.", 22),
      sig("s1-4", "EXPANSION", "MEDIUM", "GOOGLE_NEWS", "Announced APAC expansion into Singapore and Australia", "Signal-1 Corp expands into APAC with regional hires.", 30),
      sig("s1-5", "EXEC_CONTENT", "MEDIUM", "REDDIT", "CRO posted about outbound pipeline challenges", "Post: 'Anyone using AI-driven prospecting at Series B stage?' (score: 45)", 5),
    ],
    signal_score: { high_count: 3, medium_count: 2, low_count: 0, total_score: 38 },
    buying_stage: "READY_TO_BUY",
    buying_stage_method: "RULES",
    buying_stage_reasoning: "3 HIGH signals → READY_TO_BUY (rules-based classification).",
    recommended_outreach_approach:
      "Streamline the path to close. Offer commercial flexibility, a rapid implementation plan, and legal/security docs upfront. Engage the DECISION_MAKER directly.",
    intel_report: MOCK_INTEL_REPORT,
  },

  "signal-2.example.com": {
    account_domain: "signal-2.example.com",
    tier: "TIER_1",
    signals: [
      sig("s2-1", "LEADERSHIP_HIRE", "HIGH", "LINKEDIN_JOBS", "New CRO appointed — strong leadership change signal", "Open role: Chief Revenue Officer. Leadership hire detected.", 10),
      sig("s2-2", "RELEVANT_HIRE", "MEDIUM", "LINKEDIN_JOBS", "Hiring Sales Development Representatives (3 open roles)", "Multiple SDR roles open — scaling outbound team.", 14),
      sig("s2-3", "EXEC_CONTENT", "LOW", "REDDIT", "CEO mentioned exploring B2B sales tools", "Post: 'Looking for sales automation recommendations' (score: 8)", 20),
    ],
    signal_score: { high_count: 1, medium_count: 1, low_count: 1, total_score: 15 },
    buying_stage: "EVALUATING",
    buying_stage_method: "LLM_TIEBREAKER",
    buying_stage_reasoning:
      "Mixed signals (1 HIGH leadership hire + 1 MEDIUM hire + 1 LOW) — LLM tiebreaker classified as EVALUATING based on leadership change + active hiring pattern.",
    recommended_outreach_approach:
      "Move fast — they're comparing vendors now. Lead with competitive differentiators, reference customers, and a clear success plan. Push for a champion.",
    intel_report: null,  // Tier 1 but not yet generated — tests "generate now" CTA
  },

  "signal-3.example.com": {
    account_domain: "signal-3.example.com",
    tier: "TIER_2",
    signals: [
      sig("s3-1", "FUNDING", "HIGH", "CRUNCHBASE", "Raised Series A — growth stage investment", "Series A funding announced. Companies at this stage actively explore tooling.", 45),
      sig("s3-2", "RELEVANT_HIRE", "MEDIUM", "LINKEDIN_JOBS", "Hiring Head of Sales — revenue function buildout", "Open role: Head of Sales", 18),
    ],
    signal_score: { high_count: 1, medium_count: 1, low_count: 0, total_score: 14 },
    buying_stage: "SOLUTION_AWARE",
    buying_stage_method: "RULES",
    buying_stage_reasoning: "1 HIGH signal alone — notable but insufficient for EVALUATING/READY_TO_BUY.",
    recommended_outreach_approach:
      "Differentiate on your unique strengths vs. alternatives. Offer a proof-of-concept or ROI calculator. Invite them to a focused demo.",
    intel_report: null,  // Tier 2 — should be hidden
  },

  "signal-4.example.com": {
    account_domain: "signal-4.example.com",
    tier: "TIER_2",
    signals: [
      sig("s4-1", "EXEC_CONTENT", "LOW", "REDDIT", "Company mentioned in a RevOps discussion", "Comment mentioning pain with manual prospecting.", 25),
      sig("s4-2", "ICP_MATCH_NO_SIGNAL", "LOW", "CRUNCHBASE", "ICP match — no active buying signals detected", "Profile matches ICP but no strong intent signals observed.", 60),
    ],
    signal_score: { high_count: 0, medium_count: 0, low_count: 2, total_score: 2 },
    buying_stage: "PROBLEM_AWARE",
    buying_stage_method: "RULES",
    buying_stage_reasoning: "2 LOW signal(s) only — awareness of pain, not actively shopping.",
    recommended_outreach_approach:
      "Acknowledge the pain with specific evidence. Use case studies from similar companies. Position as a trusted advisor, not a vendor.",
    intel_report: null,
  },

  "signal-5.example.com": {
    account_domain: "signal-5.example.com",
    tier: "TIER_3",
    signals: [],
    signal_score: { high_count: 0, medium_count: 0, low_count: 0, total_score: 0 },
    buying_stage: "UNAWARE",
    buying_stage_method: "RULES",
    buying_stage_reasoning: "0 signals detected — no observable buying activity.",
    recommended_outreach_approach:
      "Lead with education and thought leadership. Share insights about the problem space before pitching — they don't know they need you yet.",
    intel_report: null,
  },
};

// Fill in remaining domains with minimal data
for (let i = 6; i <= 10; i++) {
  const domain = `signal-${i}.example.com`;
  if (!signalData[domain]) {
    signalData[domain] = {
      account_domain: domain,
      tier: i <= 7 ? "TIER_1" : "TIER_2",
      signals: [
        sig(`s${i}-1`, "RELEVANT_HIRE", "MEDIUM", "LINKEDIN_JOBS", "Hiring for sales-adjacent role", "Open role detected.", 20),
      ],
      signal_score: { high_count: 0, medium_count: 1, low_count: 0, total_score: 4 },
      buying_stage: "SOLUTION_AWARE",
      buying_stage_method: "RULES",
      buying_stage_reasoning: "1 MEDIUM signal — exploring solutions.",
      recommended_outreach_approach: "Differentiate and offer a proof-of-concept.",
      intel_report: null,
    };
  }
}

export function getMockSignalsByDomain(domain: string): SignalReport | null {
  return signalData[domain] ?? null;
}

export function getMockSignalsByClient(clientId: string): Record<string, SignalReport> | null {
  if (clientId !== MOCK_CLIENT_ID) return null;
  return signalData;
}
