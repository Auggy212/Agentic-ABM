import type { IntakeResponse, CsvUploadResponse, DraftSaveResponse } from "@/lib/api";

export const mockIntakeNeedsClarity: IntakeResponse = {
  status: "needs_clarification",
  clarifying_questions: [
    {
      field: "company.value_prop",
      question:
        "Your value proposition is quite brief. Can you describe the specific outcome your customers achieve and what makes you meaningfully different from alternatives?",
    },
    {
      field: "icp.buying_triggers",
      question:
        "Can you give 2–3 concrete events that signal a company is ready to buy? For example: 'just raised Series B', 'new VP Sales hired in last 90 days'.",
    },
  ],
  warnings: [],
};

export const mockIntakeComplete: IntakeResponse = {
  status: "complete",
  master_context: {
    company: {
      name: "Acme AI",
      website: "https://acme.ai",
      industry: "Revenue Intelligence SaaS",
      stage: "Series A",
      product: "AI ABM platform",
      value_prop:
        "We help Series B SaaS companies cut manual prospecting by 80% using real-time buyer-intent signals and AI-driven account scoring.",
      differentiators: ["real-time signals", "native HubSpot sync"],
      pricing_model: "Subscription",
      acv_range: "$20k-$80k",
      reference_customers: ["Gong", "Outreach"],
    },
    icp: {
      industries: ["Revenue Intelligence SaaS", "Fintech"],
      company_size_employees: "100-500",
      company_size_arr: "$5M-$50M",
      funding_stage: ["Series A", "Series B"],
      geographies: ["USA", "Canada"],
      tech_stack_signals: ["HubSpot", "Salesforce", "Snowflake"],
      buying_triggers: ["new VP sales hire", "series b funding"],
      negative_icp: [],
    },
    buyers: {
      titles: ["VP Sales", "CRO"],
      seniority: ["VP", "C-Suite"],
      buying_committee_size: "3-5",
      pain_points: ["manual prospecting wastes 10 hours per week per rep"],
      unstated_needs: ["pipeline predictability"],
    },
    competitors: [{ name: "6sense", weaknesses: ["expensive", "complex setup"] }],
    gtm: {
      win_themes: ["ROI in 90 days"],
      loss_themes: ["budget"],
      channels: ["LinkedIn", "Email"],
      crm: "HubSpot",
      existing_account_list: null,
    },
    meta: {
      created_at: new Date().toISOString(),
      client_id: "12345678-1234-5678-1234-567812345678",
      version: "1.0.0",
    },
  },
  warnings: [],
};

export const mockDraftSave: DraftSaveResponse = {
  draft_id: "12345678-1234-5678-1234-567812345678",
  saved_at: new Date().toISOString(),
};

export const mockCsvUpload: CsvUploadResponse = {
  valid: true,
  row_count: 42,
  warnings: [],
  errors: [],
  preview: [
    { "Company Name": "Acme Corp", Website: "https://acme.com", Industry: "SaaS", Headcount: "120" },
    { "Company Name": "Beta Inc",  Website: "https://beta.io",  Industry: "Fintech", Headcount: "85" },
    { "Company Name": "Gamma Ltd", Website: "https://gamma.co", Industry: "SaaS", Headcount: "200" },
  ],
};

export const mockCsvUploadMissingCols: CsvUploadResponse = {
  valid: false,
  row_count: 0,
  warnings: [],
  errors: ["Missing required column: 'Company Name'", "Missing required column: 'Website'"],
  preview: [],
};
