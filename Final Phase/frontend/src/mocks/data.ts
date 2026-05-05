import type {
  AccountDetailResponse,
  AccountsListResponse,
  BuyersResponse,
  CampaignHandoffResponse,
  CampaignLaunchResponse,
  CampaignLeadsResponse,
  CampaignReportResponse,
  ContactMessagesResponse,
  IntakeResponse,
  MessagesGenerateResponse,
  SignalsResponse,
  UpdateContactMessageResponse,
  VerifyStatusResponse,
  VerifyTriggerResponse
} from "../types/api.types";

export const mockIntakeSubmitResponse: IntakeResponse = {
  intakeId: "intake_001",
  status: "accepted",
  version: "v1",
  createdAt: new Date().toISOString()
};

export const mockAccountsListResponse: AccountsListResponse = {
  total: 1,
  items: [
    {
      id: "acc_1",
      name: "Sample Startup",
      domain: "sample-startup.in",
      industry: "B2B SaaS",
      employeeCount: 120,
      arr: { currency: "INR", value: 90000000 },
      tier: "T2",
      icpScore: 78,
      scoreUpdatedAt: new Date().toISOString()
    }
  ]
};

export const mockAccountByIdResponse: AccountDetailResponse = {
  account: mockAccountsListResponse.items[0],
  scoreBreakdown: [{ factor: "industryFit", weight: 0.4, score: 82, explanation: "Strong vertical match." }],
  recommendedActions: ["Run founder-intro outreach"]
};

export const mockBuyersResponse: BuyersResponse = {
  companyDomain: "sample-startup.in",
  committeeSize: 2,
  contacts: [
    {
      contactId: "con_1",
      fullName: "Asha Rao",
      title: "Founder",
      seniority: "C-Level",
      email: "asha@sample-startup.in",
      linkedinUrl: "https://linkedin.com/in/asha",
      committeeRole: "decision_maker"
    }
  ]
};

export const mockSignalsResponse: SignalsResponse = {
  companyDomain: "sample-startup.in",
  buyingStage: "consideration",
  intentScore: 74,
  signals: [
    {
      signalId: "sig_1",
      type: "funding",
      source: "news",
      strength: 85,
      observedAt: new Date().toISOString(),
      summary: "Raised Series A recently."
    }
  ],
  intelReport: {
    companySnapshot: ["B2B SaaS startup with 120 employees.", "Series A funded, ramping GTM aggressively."],
    strategicPriorities: ["Scale outbound pipeline", "Reduce CAC by 20%", "Expand into APAC markets"],
    techStack: ["HubSpot CRM", "Outreach.io", "Segment", "Mixpanel"],
    painPoints: ["Manual lead research consuming SDR time", "Inconsistent messaging across channels"],
    recentNews: ["Raised Series A from Sequoia India", "Hired VP Sales from Chargebee"],
    recommendedOutreach: "Lead with the ROI story — specifically how teams like theirs cut SDR research time by 60%. Mention Chargebee and Freshworks as similar wins.",
    summary: "Ramping GTM and likely evaluating tooling.",
    keyRisks: ["Small revops team"],
    opportunities: ["New SDR hiring signal"]
  }
};

export const mockVerifyTriggerResponse: VerifyTriggerResponse = {
  verificationId: "ver_1",
  status: "queued",
  startedAt: new Date().toISOString()
};

export const mockVerifyStatusResponse: VerifyStatusResponse = {
  verificationId: "ver_1",
  status: "completed",
  completedAt: new Date().toISOString(),
  summary: { accountsChecked: 12, contactsChecked: 30, passRate: 0.92, readyToLaunch: true },
  issues: []
};

export const mockMessagesGenerateResponse: MessagesGenerateResponse = {
  generationId: "gen_1",
  accountId: "acc_1",
  contactsGenerated: 1,
  packages: [
    {
      contactId: "con_1",
      messages: [
        {
          channel: "email",
          subject: "Quick idea for GTM acceleration",
          body: "Hi Asha, sharing a short idea...",
          cta: "Open to a quick 15-min call?",
          status: "draft",
          version: 1,
          lastUpdatedAt: new Date().toISOString()
        }
      ]
    }
  ]
};

export const mockContactMessagesResponse: ContactMessagesResponse = {
  contactId: "con_1",
  accountId: "acc_1",
  messages: mockMessagesGenerateResponse.packages[0].messages
};

export const mockUpdateMessageResponse: UpdateContactMessageResponse = {
  contactId: "con_1",
  channel: "email",
  status: "edited",
  version: 2,
  updatedAt: new Date().toISOString()
};

export const mockCampaignLaunchResponse: CampaignLaunchResponse = {
  campaignId: "cmp_1",
  status: "running",
  launchedAt: new Date().toISOString(),
  contactsEnqueued: 15
};

export const mockCampaignReportResponse: CampaignReportResponse = {
  campaignId: "cmp_1",
  generatedAt: new Date().toISOString(),
  totals: { delivered: 120, opened: 68, replied: 16, meetingsBooked: 6, sqlCreated: 8, handoffsAccepted: 4 },
  daily: [
    {
      date: new Date().toISOString().slice(0, 10),
      delivered: 120,
      opened: 68,
      replied: 16,
      meetingsBooked: 6,
      sqlCreated: 8,
      handoffsAccepted: 4
    }
  ]
};

export const mockCampaignLeadsResponse: CampaignLeadsResponse = {
  threshold: 60,
  total: 2,
  leads: [
    {
      contactId: "con_1",
      accountId: "acc_1",
      leadScore: 74,
      qualificationReason: "Positive signal + high engagement",
      owner: { name: "Sales Exec", email: "sales@example.com" },
      status: "new"
    }
  ]
};

export const mockCampaignHandoffResponse: CampaignHandoffResponse = {
  contactId: "con_1",
  status: "accepted_by_sales",
  accepted: true,
  acceptedAt: new Date().toISOString(),
  acceptedBy: { name: "Sales Exec", email: "sales@example.com" }
};

export const mockByEndpoint = {
  "/api/intake:POST": mockIntakeSubmitResponse,
  "/api/accounts:GET": mockAccountsListResponse,
  "/api/accounts/:id:GET": mockAccountByIdResponse,
  "/api/buyers:GET": mockBuyersResponse,
  "/api/signals:GET": mockSignalsResponse,
  "/api/verify:POST": mockVerifyTriggerResponse,
  "/api/verify/status:GET": mockVerifyStatusResponse,
  "/api/messages/generate:POST": mockMessagesGenerateResponse,
  "/api/messages/:contactId:GET": mockContactMessagesResponse,
  "/api/messages/:contactId:PUT": mockUpdateMessageResponse,
  "/api/campaigns/launch:POST": mockCampaignLaunchResponse,
  "/api/campaigns/report:GET": mockCampaignReportResponse,
  "/api/campaigns/leads:GET": mockCampaignLeadsResponse,
  "/api/campaigns/handoff/:contactId:POST": mockCampaignHandoffResponse
} as const;
