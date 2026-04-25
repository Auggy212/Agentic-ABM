import type { SequencesResponse } from "@/types/sequences";

export const mockSequences: SequencesResponse = {
  kpis: [
    { label: "Sent this week",  num: "1,284", delta: "+18% vs last" },
    { label: "Reply rate",      num: "14.2%", delta: "+2.1pp"       },
    { label: "Meetings booked", num: "23",    delta: "+9 MTD"       },
    { label: "Pipeline",        num: "$1.4M", delta: "8 in stage 2+" },
  ],
  sequences: [
    {
      id: "seq-1",
      name: "Series B Trigger Play",
      description: "Targets RevOps + CRO personas at Series B companies within 6 months of announcement. High-intent, time-sensitive.",
      status: "active",
      accounts: 24,
      contacts: 71,
      metrics: { sent: 142, opened: 0.61, replied: 0.14, meetings: 8 },
      steps: [
        {
          id: "s1-1", day: 1, channel: "email",
          title: "Congrats on the raise — quick thought",
          body: "Hi {{first_name}}, saw the news about {{company}}'s Series B — congrats! One thing we see at this stage is that outbound coverage tends to lag the growth plan. Quick question: how are you thinking about ICP expansion right now?",
          stats: { open: "68%", reply: "18%" },
        },
        {
          id: "s1-2", day: 3, channel: "linkedin",
          title: "LinkedIn connection + note",
          body: "Connecting with context: your team just raised to scale revenue — I help RevOps leaders build the account intelligence layer that makes outbound actually land.",
          stats: { accepted: "41%" },
        },
        {
          id: "s1-3", day: 6, channel: "email",
          title: "The one thing that moves pipeline at Series B",
          body: "Most Series B revenue teams have the SDR headcount but not the account data. Here's a 3-minute read on how two of our customers fixed that in under a week.",
          stats: { open: "54%", click: "22%" },
        },
        {
          id: "s1-4", day: 9, channel: "call",
          title: "Quick call — 15 min",
          body: "Following up on my emails. Worth a 15-min call to show you the ICP scoring model we built for Rippling post-Series B? I can share the exact signals we track.",
          stats: {},
        },
        {
          id: "s1-5", day: 12, channel: "email",
          title: "Last note for now",
          body: "Didn't want to leave without sharing this: {{company}} maps closely to 4 accounts we helped get to >30% reply rate in the first month. Happy to share the breakdown — no commitment.",
          stats: { open: "48%", reply: "9%" },
        },
      ],
    },
    {
      id: "seq-2",
      name: "Outbound Cold — Vertical SaaS",
      description: "Broad prospecting to Vertical SaaS companies with 200–800 headcount. Focused on pipeline coverage pain.",
      status: "active",
      accounts: 48,
      contacts: 132,
      metrics: { sent: 380, opened: 0.44, replied: 0.09, meetings: 11 },
      steps: [
        {
          id: "s2-1", day: 1, channel: "email",
          title: "How {{company}} thinks about ICP",
          body: "Hi {{first_name}} — quick question: how much of your current outbound is going to accounts that aren't actually a good fit?",
          stats: { open: "49%", reply: "11%" },
        },
        {
          id: "s2-2", day: 4, channel: "linkedin",
          title: "Thought you'd find this useful",
          body: "Sharing a resource on ICP definition for Vertical SaaS — it's the framework we built with 3 CROs last quarter.",
          stats: { accepted: "38%" },
        },
      ],
    },
    {
      id: "seq-3",
      name: "Reactivation — Dormant Tier 1",
      description: "Re-engages Tier 1 accounts that went dark after initial contact. Uses new signal context to restart.",
      status: "paused",
      accounts: 12,
      contacts: 28,
      metrics: { sent: 24, opened: 0.38, replied: 0.04, meetings: 1 },
    },
  ],
};
