// Stub types for Accounts buyers — full implementation TBD
export interface BuyerProfile {
  contact_id: string;
  full_name: string;
  title: string;
  email: string;
  linkedin_url: string;
  committee_role: string;
  seniority: string;
  confidence?: number;
  email_status?: string;
  recent_job_change?: boolean;
  pain_points_summary?: string;
}

export interface BuyersByDomainResponse {
  account_domain: string;
  committee_size: number;
  buyers: BuyerProfile[];
}
