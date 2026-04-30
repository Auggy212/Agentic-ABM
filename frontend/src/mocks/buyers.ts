import type {
  BuyerProfile,
  BuyersByDomainResponse,
  CommitteeRole,
  EmailStatus,
  QuotaStatus,
} from "@/pages/Accounts/buyers/types";
import { DEMO_DOMAIN, getDemoBuyersByDomain, updateDemoContact } from "./demo";

export const MOCK_BUYER_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

// The 10 account domains we wire buyers to (matches mocks/accounts.ts ids 0–9)
export const BUYER_ACCOUNT_DOMAINS = [
  "signal-1.example.com",
  "signal-2.example.com",
  "signal-3.example.com",
  "signal-4.example.com",
  "signal-5.example.com",
  "signal-6.example.com",
  "signal-7.example.com",
  "signal-8.example.com",
  "signal-9.example.com",
  "signal-10.example.com",
];

function makePainPoint(topic: string, confidence: number) {
  return {
    pain_point: `Difficulty with ${topic}`,
    reasoning: `Contact title aligns with ${topic} responsibility area — [INFERRED] from ICP pain point list`,
    confidence,
    tag: "[INFERRED]" as const,
  };
}

function makeContact(
  overrides: Partial<BuyerProfile> & {
    contact_id: string;
    account_domain: string;
    full_name: string;
    current_title: string;
    committee_role: CommitteeRole;
  }
): BuyerProfile {
  return {
    first_name: overrides.full_name.split(" ")[0],
    last_name: overrides.full_name.split(" ").slice(1).join(" ") || "Unknown",
    apollo_title: overrides.current_title,
    title_mismatch_flag: false,
    seniority: "VP",
    department: "Sales",
    email: `${overrides.full_name.toLowerCase().replace(/ /g, ".")}@${overrides.account_domain}`,
    email_status: "VALID" as EmailStatus,
    phone: null,
    linkedin_url: `https://linkedin.com/in/${overrides.full_name.toLowerCase().replace(/ /g, "-")}`,
    tenure_current_role_months: 18,
    tenure_current_company_months: 36,
    job_change_signal: false,
    committee_role_confidence: 0.85,
    committee_role_reasoning: `Title matched ICP buyer criteria at VP level`,
    inferred_pain_points: [
      makePainPoint("manual prospecting", 0.6),
      makePainPoint("pipeline visibility", 0.55),
    ],
    recent_activity: [],
    source: "APOLLO",
    enriched_at: new Date("2026-04-20T10:00:00Z").toISOString(),
    ...overrides,
  };
}

// Domain → contacts map
const buyerData: Record<string, BuyerProfile[]> = {
  "signal-1.example.com": [
    makeContact({
      contact_id: "c1000-0001-0000-0000-000000000001",
      account_domain: "signal-1.example.com",
      full_name: "Priya Menon",
      current_title: "Chief Revenue Officer",
      committee_role: "DECISION_MAKER",
      seniority: "C_SUITE",
      department: "Revenue",
      email_status: "VALID",
      committee_role_confidence: 0.95,
      committee_role_reasoning: "Title 'Chief Revenue Officer' contains a C-suite token — assigned DECISION_MAKER (exact match).",
      phone: "+91-98765-43210",
    }),
    makeContact({
      contact_id: "c1000-0001-0000-0000-000000000002",
      account_domain: "signal-1.example.com",
      full_name: "Arjun Sharma",
      current_title: "VP of Sales",
      apollo_title: "Director of Sales",
      title_mismatch_flag: true,  // ← mismatch flag
      committee_role: "CHAMPION",
      seniority: "VP",
      department: "Sales",
      email_status: "VALID",
      committee_role_confidence: 0.70,
      committee_role_reasoning: "Title 'Director of Sales' partially matches ICP buyer titles ['VP Sales', 'Head of Sales'] at Director/Manager level — assigned CHAMPION (partial match).",
      inferred_pain_points: [
        makePainPoint("outbound conversion rate", 0.6),
        makePainPoint("CRM data quality", 0.5),
      ],
    }),
    makeContact({
      contact_id: "c1000-0001-0000-0000-000000000003",
      account_domain: "signal-1.example.com",
      full_name: "Nandini Krishnan",
      current_title: "Head of Sales Enablement",
      committee_role: "CHAMPION",
      seniority: "DIRECTOR",
      department: "Sales",
      email_status: "CATCH_ALL",
      committee_role_confidence: 0.70,
      committee_role_reasoning: "Title 'Head of Sales Enablement' partially matches ICP buyer titles — assigned CHAMPION (partial match).",
    }),
    makeContact({
      contact_id: "c1000-0001-0000-0000-000000000004",
      account_domain: "signal-1.example.com",
      full_name: "Vikram Patel",
      current_title: "Director of Finance",
      committee_role: "BLOCKER",
      seniority: "DIRECTOR",
      department: "Finance",
      email_status: "VALID",
      committee_role_confidence: 0.70,
      committee_role_reasoning: "Department 'Finance' is a known gate-keeping function and seniority rank=3 ≥ Director — assigned BLOCKER.",
    }),
    makeContact({
      contact_id: "c1000-0001-0000-0000-000000000005",
      account_domain: "signal-1.example.com",
      full_name: "Sonal Gupta",
      current_title: "Senior Marketing Manager",
      committee_role: "INFLUENCER",
      seniority: "MANAGER",
      department: "Marketing",
      email_status: "UNVERIFIED",
      committee_role_confidence: 0.40,
      committee_role_reasoning: "No rule matched for title 'Senior Marketing Manager' — assigned INFLUENCER (inferred default).",
      tenure_current_role_months: 4,
      job_change_signal: true,  // ← job change signal
    }),
  ],
  "signal-2.example.com": [
    makeContact({
      contact_id: "c1000-0002-0000-0000-000000000001",
      account_domain: "signal-2.example.com",
      full_name: "Rahul Verma",
      current_title: "CEO",
      committee_role: "DECISION_MAKER",
      seniority: "C_SUITE",
      department: "Executive",
      email_status: "VALID",
      committee_role_confidence: 0.95,
      committee_role_reasoning: "Title 'CEO' contains a C-suite token — assigned DECISION_MAKER (exact match).",
      phone: "+91-91234-56789",
      _operator_edit_at: new Date("2026-04-22T14:30:00Z").toISOString(),
      _operator_note: "Confirmed DM via LinkedIn outreach",
      manual_override_reason: "Verified as primary decision maker through discovery call",
    }),
    makeContact({
      contact_id: "c1000-0002-0000-0000-000000000002",
      account_domain: "signal-2.example.com",
      full_name: "Deepa Nair",
      current_title: "VP Marketing",
      committee_role: "CHAMPION",
      seniority: "VP",
      department: "Marketing",
      email_status: "VALID",
      committee_role_confidence: 0.70,
      committee_role_reasoning: "VP-level seniority with department 'Marketing' aligned to ICP buyer titles — assigned DECISION_MAKER (partial match).",
    }),
    makeContact({
      contact_id: "c1000-0002-0000-0000-000000000003",
      account_domain: "signal-2.example.com",
      full_name: "Anil Kumar",
      current_title: "Head of IT Security",
      apollo_title: "IT Security Manager",  // mismatch
      title_mismatch_flag: true,
      committee_role: "BLOCKER",
      seniority: "DIRECTOR",
      department: "IT Security",
      email_status: "INVALID",
      committee_role_confidence: 0.70,
      committee_role_reasoning: "Department 'IT Security' is a known gate-keeping function — assigned BLOCKER.",
    }),
  ],
  "signal-3.example.com": [
    makeContact({
      contact_id: "c1000-0003-0000-0000-000000000001",
      account_domain: "signal-3.example.com",
      full_name: "Kavitha Subramaniam",
      current_title: "CTO",
      committee_role: "DECISION_MAKER",
      seniority: "C_SUITE",
      department: "Technology",
      email_status: "VALID",
      committee_role_confidence: 0.95,
      committee_role_reasoning: "Title 'CTO' contains a C-suite token — assigned DECISION_MAKER (exact match).",
    }),
    makeContact({
      contact_id: "c1000-0003-0000-0000-000000000002",
      account_domain: "signal-3.example.com",
      full_name: "Rohan Desai",
      current_title: "Sales Manager",
      committee_role: "CHAMPION",
      seniority: "MANAGER",
      department: "Sales",
      email_status: "CATCH_ALL",
      committee_role_confidence: 0.70,
    }),
  ],
  "signal-4.example.com": [
    makeContact({
      contact_id: "c1000-0004-0000-0000-000000000001",
      account_domain: "signal-4.example.com",
      full_name: "Meera Iyer",
      current_title: "COO",
      committee_role: "DECISION_MAKER",
      seniority: "C_SUITE",
      department: "Operations",
      email_status: "VALID",
      committee_role_confidence: 0.95,
      committee_role_reasoning: "Title 'COO' contains a C-suite token — assigned DECISION_MAKER (exact match).",
    }),
  ],
  "signal-5.example.com": [],  // empty — no buyers found
  "signal-6.example.com": [
    makeContact({
      contact_id: "c1000-0006-0000-0000-000000000001",
      account_domain: "signal-6.example.com",
      full_name: "Sneha Pillai",
      current_title: "VP of Revenue Operations",
      committee_role: "DECISION_MAKER",
      seniority: "VP",
      department: "Revenue Operations",
      email_status: "VALID",
      committee_role_confidence: 0.70,
    }),
    makeContact({
      contact_id: "c1000-0006-0000-0000-000000000002",
      account_domain: "signal-6.example.com",
      full_name: "Kiran Bhat",
      current_title: "Director of Sales Development",
      committee_role: "CHAMPION",
      seniority: "DIRECTOR",
      department: "Sales",
      email_status: "UNVERIFIED",
      committee_role_confidence: 0.70,
    }),
    makeContact({
      contact_id: "c1000-0006-0000-0000-000000000003",
      account_domain: "signal-6.example.com",
      full_name: "Ananya Singh",
      current_title: "Marketing Operations Manager",
      committee_role: "INFLUENCER",
      seniority: "MANAGER",
      department: "Marketing",
      email_status: "VALID",
      committee_role_confidence: 0.40,
    }),
  ],
  "signal-7.example.com": [
    makeContact({
      contact_id: "c1000-0007-0000-0000-000000000001",
      account_domain: "signal-7.example.com",
      full_name: "Rajesh Nambiar",
      current_title: "Chief Marketing Officer",
      committee_role: "DECISION_MAKER",
      seniority: "C_SUITE",
      department: "Marketing",
      email_status: "VALID",
      committee_role_confidence: 0.95,
      committee_role_reasoning: "Title 'Chief Marketing Officer' contains a C-suite token — assigned DECISION_MAKER (exact match).",
    }),
    makeContact({
      contact_id: "c1000-0007-0000-0000-000000000002",
      account_domain: "signal-7.example.com",
      full_name: "Pooja Rajan",
      current_title: "Head of Sales",
      committee_role: "CHAMPION",
      seniority: "DIRECTOR",
      department: "Sales",
      email_status: "VALID",
      committee_role_confidence: 0.95,
      committee_role_reasoning: "Title 'Head of Sales' exactly matches an ICP buyer title at Director/Manager level — assigned CHAMPION (exact match).",
    }),
  ],
  "signal-8.example.com": [
    makeContact({
      contact_id: "c1000-0008-0000-0000-000000000001",
      account_domain: "signal-8.example.com",
      full_name: "Varun Malhotra",
      current_title: "CRO",
      committee_role: "DECISION_MAKER",
      seniority: "C_SUITE",
      department: "Revenue",
      email_status: "VALID",
      committee_role_confidence: 0.95,
    }),
    makeContact({
      contact_id: "c1000-0008-0000-0000-000000000002",
      account_domain: "signal-8.example.com",
      full_name: "Lakshmi Venkatesh",
      current_title: "VP Sales",
      committee_role: "CHAMPION",
      seniority: "VP",
      department: "Sales",
      email_status: "VALID",
      committee_role_confidence: 0.95,
      tenure_current_role_months: 3,
      job_change_signal: true,
    }),
    makeContact({
      contact_id: "c1000-0008-0000-0000-000000000003",
      account_domain: "signal-8.example.com",
      full_name: "Suresh Chandrasekhar",
      current_title: "Legal Counsel",
      committee_role: "BLOCKER",
      seniority: "DIRECTOR",
      department: "Legal",
      email_status: "UNVERIFIED",
      committee_role_confidence: 0.70,
    }),
  ],
  "signal-9.example.com": [
    makeContact({
      contact_id: "c1000-0009-0000-0000-000000000001",
      account_domain: "signal-9.example.com",
      full_name: "Divya Krishnamurthy",
      current_title: "CEO & Co-founder",
      committee_role: "DECISION_MAKER",
      seniority: "C_SUITE",
      department: "Executive",
      email_status: "VALID",
      committee_role_confidence: 0.95,
    }),
  ],
  "signal-10.example.com": [
    makeContact({
      contact_id: "c1000-0010-0000-0000-000000000001",
      account_domain: "signal-10.example.com",
      full_name: "Aditya Rao",
      current_title: "VP of Marketing",
      committee_role: "DECISION_MAKER",
      seniority: "VP",
      department: "Marketing",
      email_status: "VALID",
      committee_role_confidence: 0.70,
    }),
    makeContact({
      contact_id: "c1000-0010-0000-0000-000000000002",
      account_domain: "signal-10.example.com",
      full_name: "Bhavna Kapoor",
      current_title: "Director of Growth",
      committee_role: "CHAMPION",
      seniority: "DIRECTOR",
      department: "Growth",
      email_status: "CATCH_ALL",
      committee_role_confidence: 0.70,
    }),
  ],
};

// State — supports operator edits in-memory
const overrides: Record<string, Partial<BuyerProfile>> = {};

function applyOverrides(contact: BuyerProfile): BuyerProfile {
  const o = overrides[contact.contact_id];
  return o ? { ...contact, ...o } : contact;
}

export function getMockBuyersByDomain(domain: string): BuyersByDomainResponse | null {
  if (domain === DEMO_DOMAIN) return getDemoBuyersByDomain();
  const contacts = buyerData[domain];
  if (contacts === undefined) return null;
  const enriched = contacts.map(applyOverrides);
  return { domain, contacts: enriched, total: enriched.length };
}

export function getMockBuyersByClient(clientId: string) {
  if (clientId !== MOCK_BUYER_CLIENT_ID) return null;

  const accounts: Record<string, BuyerProfile[]> = {};
  let totalContacts = 0;
  let mismatches = 0;

  // Demo account first
  const demo = getDemoBuyersByDomain();
  accounts[DEMO_DOMAIN] = demo.contacts;
  totalContacts += demo.contacts.length;
  mismatches += demo.contacts.filter((c) => c.title_mismatch_flag).length;

  for (const [domain, contacts] of Object.entries(buyerData)) {
    const enriched = contacts.map(applyOverrides);
    accounts[domain] = enriched;
    totalContacts += enriched.length;
    mismatches += enriched.filter((c) => c.title_mismatch_flag).length;
  }

  return {
    client_id: clientId,
    generated_at: new Date("2026-04-20T10:00:00Z").toISOString(),
    accounts,
    meta: {
      total_accounts_processed: Object.keys(accounts).length,
      total_contacts_found: totalContacts,
      contacts_per_account_avg: totalContacts / Object.keys(accounts).length,
      hunter_quota_used: 12,
      apollo_quota_used: 38,
      mismatches_flagged: mismatches,
      quota_warnings: [],
      pending_domains: [],
      status: "complete",
    },
  };
}

export function updateMockContact(
  contactId: string,
  patch: Partial<BuyerProfile>
): BuyerProfile | null {
  // Try demo contacts first
  const demoResult = updateDemoContact(contactId, patch);
  if (demoResult) return demoResult;

  for (const contacts of Object.values(buyerData)) {
    const contact = contacts.find((c) => c.contact_id === contactId);
    if (contact) {
      overrides[contactId] = { ...(overrides[contactId] ?? {}), ...patch };
      return applyOverrides(contact);
    }
  }
  return null;
}

export function getMockQuotaStatus(): QuotaStatus {
  return {
    APOLLO_CONTACTS: { used: 38, limit: 50 },
    HUNTER: { used: 24, limit: 25 },
    LUSHA: { used: 2, limit: 5 },
    NEVERBOUNCE: { used: 423, limit: 1000 },
    ZEROBOUNCE: { used: 67, limit: 100 },
  };
}
