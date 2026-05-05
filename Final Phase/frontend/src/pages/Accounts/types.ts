// Stub types for Accounts module — full implementation TBD
export interface AccountRecord {
  id: string;
  domain: string;
  name: string;
  industry: string;
  tier: "T1" | "T2" | "T3";
  icp_score: number;
  employee_count?: number;
  arr?: number;
  geography?: string;
  score_updated_at?: string;
}
