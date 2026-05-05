/**
 * src/mocks/salesLeads.ts
 * Mock data for the Sales Handoff and Sales Acceptance pages.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | "email_opened"
  | "email_replied"
  | "linkedin_accepted"
  | "linkedin_replied"
  | "whatsapp_replied"
  | "meeting_booked";

export interface TimelineEvent {
  type: TimelineEventType;
  label: string;
  detail?: string;
  completed: boolean;
}

export interface EnrichedLead {
  contactId: string;
  fullName: string;
  title: string;
  company: string;
  industry: string;
  engagementScore: number;
  status: "new" | "accepted" | "rejected" | "nurturing";
  handoffNote: string;
  qualificationReason: string;
  conversationSnippet?: string;
  email?: string;
  linkedinUrl?: string;
  timeline: TimelineEvent[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

export const mockEnrichedLeads: EnrichedLead[] = [
  {
    contactId: "lead_001",
    fullName: "Asha Rao",
    title: "Founder & CEO",
    company: "Northstar Revenue",
    industry: "B2B SaaS",
    engagementScore: 87,
    status: "new",
    handoffNote:
      "Asha has opened 4 emails and replied twice. She booked a demo slot and asked about integrations — strong purchase intent. Prioritise AE outreach this week.",
    qualificationReason: "Series A, 80 employees, RevOps hiring signal, replied to sequence",
    conversationSnippet:
      "Looks interesting — can you walk me through the integration with HubSpot? We're evaluating a few tools right now.",
    email: "asha@northstarrevenue.com",
    linkedinUrl: "https://linkedin.com/in/asharao",
    timeline: [
      { type: "email_opened", label: "Email opened", detail: "Day 1 cold email", completed: true },
      { type: "email_replied", label: "Email replied", detail: "Expressed interest in demo", completed: true },
      { type: "linkedin_accepted", label: "LinkedIn accepted", completed: true },
      { type: "linkedin_replied", label: "LinkedIn replied", detail: "Asked about pricing", completed: true },
      { type: "meeting_booked", label: "Meeting booked", detail: "30-min discovery call", completed: true },
      { type: "whatsapp_replied", label: "WhatsApp replied", completed: false },
    ],
  },
  {
    contactId: "lead_002",
    fullName: "Ravi Menon",
    title: "VP of Sales",
    company: "Zenith Fintech",
    industry: "Fintech",
    engagementScore: 72,
    status: "new",
    handoffNote:
      "Ravi clicked three email CTAs and connected on LinkedIn. He hasn't replied yet but his behaviour indicates active evaluation.",
    qualificationReason: "Fintech, 200+ employees, SDR hiring, tech-change signal detected",
    conversationSnippet: undefined,
    email: "ravi@zenithfintech.io",
    linkedinUrl: "https://linkedin.com/in/ravimenon",
    timeline: [
      { type: "email_opened", label: "Email opened", detail: "Three opens on sequence day 3", completed: true },
      { type: "linkedin_accepted", label: "LinkedIn accepted", completed: true },
      { type: "email_replied", label: "Email replied", completed: false },
      { type: "meeting_booked", label: "Meeting booked", completed: false },
    ],
  },
  {
    contactId: "lead_003",
    fullName: "Priya Sharma",
    title: "Head of Revenue Operations",
    company: "ClearPath Analytics",
    industry: "Analytics",
    engagementScore: 63,
    status: "nurturing",
    handoffNote:
      "Priya replied once asking for a case study. Currently in nurture — follow up when new content drops.",
    qualificationReason: "Analytics SaaS, 60 employees, funding round closed last quarter",
    conversationSnippet: "Can you share a case study from a similar company in our space?",
    email: "priya@clearpathanalytics.com",
    linkedinUrl: "https://linkedin.com/in/priyasharma",
    timeline: [
      { type: "email_opened", label: "Email opened", completed: true },
      { type: "email_replied", label: "Email replied", detail: "Requested case study", completed: true },
      { type: "linkedin_accepted", label: "LinkedIn accepted", completed: false },
      { type: "meeting_booked", label: "Meeting booked", completed: false },
    ],
  },
  {
    contactId: "lead_004",
    fullName: "Arjun Kapoor",
    title: "CRO",
    company: "Momentum Labs",
    industry: "MarTech",
    engagementScore: 91,
    status: "new",
    handoffNote:
      "Arjun has completed every touchpoint and is actively asking about contract terms — this lead is red-hot. Escalate immediately to AE.",
    qualificationReason: "MarTech, 150 employees, Series B, procurement trigger detected",
    conversationSnippet: "We're ready to move — what does the onboarding timeline look like?",
    email: "arjun@momentumlabs.co",
    linkedinUrl: "https://linkedin.com/in/arjunkapoor",
    timeline: [
      { type: "email_opened", label: "Email opened", completed: true },
      { type: "email_replied", label: "Email replied", detail: "Asked about pricing", completed: true },
      { type: "linkedin_accepted", label: "LinkedIn accepted", completed: true },
      { type: "linkedin_replied", label: "LinkedIn replied", detail: "Discussed use case", completed: true },
      { type: "whatsapp_replied", label: "WhatsApp replied", detail: "Confirmed budget approval", completed: true },
      { type: "meeting_booked", label: "Meeting booked", detail: "Full demo scheduled", completed: true },
    ],
  },
  {
    contactId: "lead_005",
    fullName: "Sneha Iyer",
    title: "Director of Growth",
    company: "Rocket Retail",
    industry: "E-Commerce",
    engagementScore: 44,
    status: "new",
    handoffNote:
      "Low engagement but industry fit is strong. Keep in sequence and monitor for activity spike.",
    qualificationReason: "E-Commerce scale-up, 300 employees, RevOps role open",
    timeline: [
      { type: "email_opened", label: "Email opened", completed: true },
      { type: "email_replied", label: "Email replied", completed: false },
      { type: "meeting_booked", label: "Meeting booked", completed: false },
    ],
  },
  {
    contactId: "lead_006",
    fullName: "Kiran Bose",
    title: "CEO",
    company: "TalentOS",
    industry: "HR Tech",
    engagementScore: 78,
    status: "new",
    handoffNote:
      "Kiran replied on WhatsApp and opened 5 emails. HR Tech is a prime vertical for Q3 push.",
    qualificationReason: "HR Tech, 90 employees, Series A, hiring signal strong",
    conversationSnippet: "Interesting! I'd love a quick walkthrough — ping me next week.",
    email: "kiran@talentos.in",
    linkedinUrl: "https://linkedin.com/in/kiranbose",
    timeline: [
      { type: "email_opened", label: "Email opened", detail: "Five opens across sequence", completed: true },
      { type: "whatsapp_replied", label: "WhatsApp replied", detail: "Requested demo next week", completed: true },
      { type: "linkedin_accepted", label: "LinkedIn accepted", completed: true },
      { type: "meeting_booked", label: "Meeting booked", completed: false },
    ],
  },
];

// ─── Campaign KPIs Mock ───────────────────────────────────────────────────────

export const mockCampaignKPIs = {
  totalDelivered: 1842,
  openRate: 38.4,
  replyRate: 12.7,
  meetingsBooked: 24,
  sqlCreated: 17,
  handoffsAccepted: 11,
  avgEngagementScore: 68,
  activeLeads: 34,
};

// ─── Campaign Contacts (for table) ───────────────────────────────────────────

export interface CampaignContact {
  contactId: string;
  name: string;
  company: string;
  emailOpens: number;
  replies: number;
  linkedinActions: number;
  whatsappReplies: number;
  engagementScore: number;
}

export const mockCampaignContacts: CampaignContact[] = mockEnrichedLeads.map((lead) => ({
  contactId: lead.contactId,
  name: lead.fullName,
  company: lead.company,
  emailOpens: Math.floor(Math.random() * 8) + 1,
  replies: Math.floor(Math.random() * 4),
  linkedinActions: Math.floor(Math.random() * 3),
  whatsappReplies: Math.floor(Math.random() * 2),
  engagementScore: lead.engagementScore,
}));
