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
  total: 10,
  items: [
    {
      id: "acc_1",
      name: "Northstar Revenue",
      domain: "northstarrevenue.com",
      geography: "New York, USA",
      buyingStage: "decision",
      industry: "Revenue Operations SaaS",
      employeeCount: 420,
      arr: { currency: "USD", value: 28000000 },
      tier: "T1",
      icpScore: 96,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_2",
      name: "Helio Health Systems",
      domain: "heliohealthsystems.com",
      geography: "Boston, USA",
      buyingStage: "consideration",
      industry: "Healthcare Technology",
      employeeCount: 680,
      arr: { currency: "USD", value: 54000000 },
      tier: "T1",
      icpScore: 91,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_3",
      name: "Aegis Freight Cloud",
      domain: "aegisfreightcloud.com",
      geography: "Chicago, USA",
      buyingStage: "aware",
      industry: "Logistics Software",
      employeeCount: 310,
      arr: { currency: "USD", value: 18500000 },
      tier: "T2",
      icpScore: 84,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_4",
      name: "FablePay",
      domain: "fablepay.io",
      geography: "London, UK",
      buyingStage: "consideration",
      industry: "Fintech",
      employeeCount: 190,
      arr: { currency: "USD", value: 12600000 },
      tier: "T2",
      icpScore: 81,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_5",
      name: "Cinder Commerce",
      domain: "cindercommerce.com",
      geography: "Toronto, Canada",
      buyingStage: "aware",
      industry: "E-commerce Infrastructure",
      employeeCount: 240,
      arr: { currency: "USD", value: 14200000 },
      tier: "T2",
      icpScore: 77,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_6",
      name: "VerityGrid",
      domain: "veritygrid.ai",
      geography: "Austin, USA",
      buyingStage: "decision",
      industry: "Energy Analytics",
      employeeCount: 135,
      arr: { currency: "USD", value: 9800000 },
      tier: "T1",
      icpScore: 89,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_7",
      name: "Atlas LegalTech",
      domain: "atlaslegaltech.com",
      geography: "Denver, USA",
      buyingStage: "unaware",
      industry: "Legal Technology",
      employeeCount: 95,
      arr: { currency: "USD", value: 6100000 },
      tier: "T3",
      icpScore: 63,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_8",
      name: "BluePeak Manufacturing",
      domain: "bluepeakmfg.com",
      geography: "Detroit, USA",
      buyingStage: "aware",
      industry: "Industrial Manufacturing",
      employeeCount: 1200,
      arr: { currency: "USD", value: 125000000 },
      tier: "T3",
      icpScore: 58,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_9",
      name: "OpenField Learning",
      domain: "openfieldlearning.org",
      geography: "Sydney, Australia",
      buyingStage: "consideration",
      industry: "EdTech",
      employeeCount: 160,
      arr: { currency: "USD", value: 8400000 },
      tier: "T2",
      icpScore: 73,
      scoreUpdatedAt: new Date().toISOString()
    },
    {
      id: "acc_10",
      name: "Silverline Properties",
      domain: "silverlineproperties.co",
      geography: "Phoenix, USA",
      buyingStage: "unaware",
      industry: "PropTech",
      employeeCount: 88,
      arr: { currency: "USD", value: 4700000 },
      tier: "T3",
      icpScore: 49,
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
  committeeSize: 4,
  contacts: [
    {
      contactId: "con_1",
      fullName: "Asha Rao",
      title: "Founder & CEO",
      seniority: "C-Level",
      email: "asha@sample-startup.in",
      linkedinUrl: "https://linkedin.com/in/asha",
      committeeRole: "decision_maker",
      emailStatus: "valid",
      painPointsSummary:
        "Needs faster pipeline visibility across inbound and outbound so board updates stop depending on manual spreadsheet rollups.",
      recentJobChange: true
    },
    {
      contactId: "con_2",
      fullName: "Rahul Mehta",
      title: "VP of Revenue Operations",
      seniority: "VP",
      email: "rahul@sample-startup.in",
      linkedinUrl: "https://linkedin.com/in/rahul-mehta",
      committeeRole: "champion",
      emailStatus: "valid",
      painPointsSummary:
        "Owns tooling consolidation and wants cleaner attribution, routing, and handoff visibility without adding admin overhead."
    },
    {
      contactId: "con_3",
      fullName: "Nina Kapoor",
      title: "Director of Finance",
      seniority: "Director",
      email: "nina@sample-startup.in",
      linkedinUrl: "https://linkedin.com/in/nina-kapoor",
      committeeRole: "blocker",
      emailStatus: "unknown",
      painPointsSummary:
        "Pushes back on overlapping tooling spend and wants a tighter case for ROI before green-lighting another platform."
    },
    {
      contactId: "con_4",
      fullName: "Dev Malhotra",
      title: "Head of Demand Generation",
      seniority: "Head",
      email: "dev@sample-startup.in",
      linkedinUrl: "https://linkedin.com/in/dev-malhotra",
      committeeRole: "influencer",
      emailStatus: "invalid",
      painPointsSummary:
        "Cares about campaign speed and message consistency, especially when launches depend on cross-functional approvals."
    }
  ]
};

export const mockSignalsResponse: SignalsResponse = {
  companyDomain: "sample-startup.in",
  buyingStage: "evaluating",
  intentScore: 74,
  signals: [
    {
      signalId: "sig_1",
      type: "funding",
      source: "news",
      strength: 85,
      observedAt: new Date().toISOString(),
      summary: "Raised Series A recently."
    },
    {
      signalId: "sig_2",
      type: "hiring",
      source: "linkedin",
      strength: 68,
      observedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      summary: "Opened roles across RevOps and demand generation."
    },
    {
      signalId: "sig_3",
      type: "news",
      source: "press",
      strength: 32,
      observedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
      summary: "Announced expansion into two new regional markets."
    }
  ],
  intelReport: {
    companySnapshot: [
      "B2B SaaS company growing mid-market revenue teams across North America.",
      "Recent hiring and funding suggest active GTM scale-up with new process pressure."
    ],
    strategicPriorities: [
      "Improve pipeline coverage and forecast confidence.",
      "Tighten handoff visibility between marketing, SDR, and sales."
    ],
    techStack: ["Salesforce", "HubSpot", "Apollo", "Gong", "Looker"],
    painPoints: [
      "Attribution is fragmented across channels.",
      "Manual reporting still shows up in board and exec workflows.",
      "Tool sprawl creates admin drag for RevOps."
    ],
    recentNews: [
      "Closed a Series A round this quarter.",
      "Launched hiring for GTM operations and demand generation leadership."
    ],
    recommendedOutreach:
      "Lead with RevOps efficiency and executive visibility: connect recent expansion signals to faster reporting, cleaner attribution, and fewer manual handoffs."
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
