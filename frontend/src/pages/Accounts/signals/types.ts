export type IntentLevel = "HIGH" | "MEDIUM" | "LOW";
export type BuyingStage = "UNAWARE" | "PROBLEM_AWARE" | "SOLUTION_AWARE" | "EVALUATING" | "READY_TO_BUY";
export type BuyingStageMethod = "RULES" | "LLM_TIEBREAKER";
export type SignalType =
  | "COMPETITOR_REVIEW"
  | "RELEVANT_HIRE"
  | "FUNDING"
  | "LEADERSHIP_HIRE"
  | "EXPANSION"
  | "EXEC_CONTENT"
  | "WEBINAR_ATTENDED"
  | "COMPETITOR_ENGAGEMENT"
  | "LEADERSHIP_CHANGE"
  | "ICP_MATCH_NO_SIGNAL"
  | "INDUSTRY_EVENT"
  | "COMPETITOR_FOLLOW";
export type SignalSource = "LINKEDIN_JOBS" | "GOOGLE_NEWS" | "G2" | "CRUNCHBASE" | "REDDIT";
export type EvidenceStatus = "VERIFIED" | "INFERRED";
export type AccountTier = "TIER_1" | "TIER_2" | "TIER_3";

export interface AccountSignal {
  signal_id: string;
  type: SignalType;
  intent_level: IntentLevel;
  description: string;
  source: SignalSource;
  source_url: string;
  detected_at: string;
  evidence_snippet: string;
}

export interface SignalScore {
  high_count: number;
  medium_count: number;
  low_count: number;
  total_score: number;
}

export interface StrategicPriority {
  priority: string;
  evidence: string;
  evidence_status: EvidenceStatus;
  source_url: string;
}

export interface CompetitiveLandscapeEntry {
  competitor_name: string;
  evidence: string;
  evidence_status: EvidenceStatus;
  source_url: string;
}

export interface IntelInferredPainPoint {
  pain_point: string;
  evidence_status: "INFERRED";
  reasoning: string;
}

export interface RecentNewsItem {
  headline: string;
  date: string;
  source_url: string;
  summary: string;
}

export interface IntelReport {
  company_snapshot: string;
  strategic_priorities: StrategicPriority[];
  tech_stack: string[];
  competitive_landscape: CompetitiveLandscapeEntry[];
  inferred_pain_points: IntelInferredPainPoint[];
  recent_news: RecentNewsItem[];
  buying_committee_summary: string;
  recommended_angle: string;
  generated_by: { researcher: string; synthesizer: string };
  generated_at: string;
}

export interface SignalReport {
  account_domain: string;
  tier: AccountTier;
  signals: AccountSignal[];
  signal_score: SignalScore;
  buying_stage: BuyingStage;
  buying_stage_method: BuyingStageMethod;
  buying_stage_reasoning: string;
  recommended_outreach_approach: string;
  intel_report: IntelReport | null;
}
