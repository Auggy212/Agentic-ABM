export type ErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UNPROCESSABLE_ENTITY"
  | "INTERNAL_SERVER_ERROR";

export interface ErrorDetail {
  field: string;
  issue: string;
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details: ErrorDetail[];
    requestId: string;
  };
}

export interface MoneyRange {
  currency: string;
  min: number;
  max: number;
}

export interface EmployeeRange {
  min: number;
  max: number;
}

export interface CompanyProfile {
  name: string;
  website: string;
  industry: string;
  stage: string;
  productDescription: string;
  valueProposition: string;
  differentiators?: string[];
  pricingModel?: string;
  acvRange?: MoneyRange;
}

export interface IcpProfile {
  targetIndustries: string[];
  employeeRange: EmployeeRange;
  arrRange: MoneyRange;
  fundingStages: string[];
  geographies: string[];
  techStackSignals: string[];
  buyingTriggers: string[];
  negativeIcp?: string[];
}

export interface BuyerPersonaProfile {
  targetTitles: string[];
  seniorityLevels: string[];
  committeeSizeRange: EmployeeRange;
  painPoints: string[];
  unstatedNeeds: string[];
}

export interface CompetitorProfile {
  name: string;
  weaknesses: string[];
}

export interface ExistingAccount {
  accountName: string;
  domain: string;
  status?: string;
  owner?: string;
  notes?: string;
}

export interface GtmProfile {
  winThemes: string[];
  lossThemes: string[];
  preferredChannels: string[];
  crmInUse: string;
  existingAccountList?: ExistingAccount[];
}

export interface IntakeRequest {
  company: CompanyProfile;
  icp: IcpProfile;
  buyers: BuyerPersonaProfile;
  competitors: CompetitorProfile[];
  gtm: GtmProfile;
  submittedBy: {
    name: string;
    email: string;
    role?: string;
  };
}

export interface IntakeResponse {
  intakeId: string;
  status: "accepted" | "queued" | "rejected";
  version: string;
  createdAt: string;
}

export type AccountTier = "T1" | "T2" | "T3";
export type BuyingStage = "unaware" | "aware" | "consideration" | "decision";

export interface AmountValue {
  currency: string;
  value: number;
}

export interface Account {
  id: string;
  name: string;
  domain: string;
  industry: string;
  geography?: string;
  employeeCount: number;
  arr: AmountValue;
  tier: AccountTier;
  icpScore: number;
  buyingStage?: BuyingStage;
  scoreUpdatedAt: string;
}

export interface AccountsListResponse {
  items: Account[];
  total: number;
}

export interface ScoreFactor {
  factor: string;
  weight: number;
  score: number;
  explanation: string;
}

export interface AccountDetailResponse {
  account: Account;
  scoreBreakdown: ScoreFactor[];
  recommendedActions?: string[];
}

export type CommitteeRole =
  | "champion"
  | "decision_maker"
  | "influencer"
  | "blocker"
  | "user";

export interface BuyerContact {
  contactId: string;
  fullName: string;
  title: string;
  seniority: string;
  email: string;
  phone?: string;
  linkedinUrl: string;
  committeeRole: CommitteeRole;
  confidence?: number;
}

export interface BuyersResponse {
  companyDomain: string;
  committeeSize: number;
  contacts: BuyerContact[];
}

export type SignalType =
  | "hiring"
  | "funding"
  | "tech_change"
  | "web_activity"
  | "engagement"
  | "intent_data"
  | "news";

export interface IntentSignal {
  signalId: string;
  type: SignalType;
  source: string;
  strength: number;
  observedAt: string;
  summary: string;
  evidenceUrl?: string;
}

export interface SignalsResponse {
  companyDomain: string;
  buyingStage: BuyingStage;
  intentScore: number;
  signals: IntentSignal[];
  intelReport: {
    summary: string;
    keyRisks: string[];
    opportunities: string[];
  };
}

export interface VerifyRequest {
  scope: {
    accountIds: string[];
    includeContacts: boolean;
    includeSignals: boolean;
    includeMessaging: boolean;
  };
  requestedBy: {
    name: string;
    email: string;
  };
}

export interface VerifyTriggerResponse {
  verificationId: string;
  status: "queued" | "running";
  startedAt: string;
}

export interface VerificationIssue {
  severity: "low" | "medium" | "high" | "critical";
  category:
    | "data_quality"
    | "compliance"
    | "deliverability"
    | "personalization"
    | "scoring";
  message: string;
  accountId?: string;
  contactId?: string;
}

export interface VerifyStatusResponse {
  verificationId: string;
  status: "queued" | "running" | "completed" | "failed";
  completedAt: string | null;
  summary: {
    accountsChecked: number;
    contactsChecked: number;
    passRate: number;
    readyToLaunch: boolean;
  };
  issues: VerificationIssue[];
}

export type MessageChannel = "email" | "linkedin_dm" | "call_script" | "whatsapp";
export type MessageStatus = "draft" | "approved" | "sent" | "edited";

export interface ChannelMessage {
  channel: MessageChannel;
  subject: string;
  body: string;
  cta: string;
  status: MessageStatus;
  version: number;
  lastUpdatedAt: string;
  editedBy?: {
    name?: string;
    email?: string;
  };
}

export interface MessagesGenerateRequest {
  accountId: string;
  contactIds: string[];
  channels: MessageChannel[];
  tone: "consultative" | "direct" | "executive" | "friendly";
  language: "en" | "hi";
  personalizationNotes?: string[];
}

export interface ContactMessagePackage {
  contactId: string;
  messages: ChannelMessage[];
}

export interface MessagesGenerateResponse {
  generationId: string;
  accountId: string;
  contactsGenerated: number;
  packages: ContactMessagePackage[];
}

export interface ContactMessagesResponse {
  contactId: string;
  accountId: string;
  messages: ChannelMessage[];
}

export interface UpdateContactMessageRequest {
  channel: MessageChannel;
  subject: string;
  body: string;
  cta: string;
  editor: {
    name: string;
    email: string;
  };
  notes?: string;
}

export interface UpdateContactMessageResponse {
  contactId: string;
  channel: MessageChannel;
  status: "edited" | "approved";
  version: number;
  updatedAt: string;
}

export interface CampaignLaunchContact {
  contactId: string;
  approvedChannels: MessageChannel[];
}

export interface CampaignLaunchRequest {
  campaignName: string;
  accountIds: string[];
  contacts: CampaignLaunchContact[];
  schedule: {
    startAt: string;
    timezone: string;
    dailySendLimit: number;
  };
  launchedBy: {
    name: string;
    email: string;
  };
}

export interface CampaignLaunchResponse {
  campaignId: string;
  status: "scheduled" | "running";
  launchedAt: string;
  contactsEnqueued: number;
}

export interface CampaignDailyMetric {
  date: string;
  delivered: number;
  opened: number;
  replied: number;
  meetingsBooked: number;
  sqlCreated: number;
  handoffsAccepted: number;
}

export interface CampaignReportResponse {
  campaignId: string;
  generatedAt: string;
  totals: {
    delivered: number;
    opened: number;
    replied: number;
    meetingsBooked: number;
    sqlCreated: number;
    handoffsAccepted: number;
  };
  daily: CampaignDailyMetric[];
}

export interface SqlLead {
  contactId: string;
  accountId: string;
  fullName?: string;
  title?: string;
  leadScore: number;
  qualificationReason: string;
  owner: {
    name: string;
    email: string;
  };
  status: "new" | "accepted" | "rejected" | "nurturing";
  createdAt?: string;
}

export interface CampaignLeadsResponse {
  threshold: number;
  total: number;
  leads: SqlLead[];
}

export interface CampaignHandoffRequest {
  accepted: boolean;
  salesExec: {
    name: string;
    email: string;
  };
  note: string;
  nextActionAt?: string;
}

export interface CampaignHandoffResponse {
  contactId: string;
  status: "accepted_by_sales" | "rejected_by_sales";
  accepted: boolean;
  acceptedAt: string;
  acceptedBy: {
    name: string;
    email: string;
  };
  note?: string;
}
