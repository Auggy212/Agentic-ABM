import type { AgentsResponse, AgentEvent } from "@/types/agents";

let _eventCounter = 0;

function nextId() {
  return `evt-${++_eventCounter}`;
}

const BASE_EVENTS: Omit<AgentEvent, "id">[] = [
  { time: "12:04:31", tone: "found", agent: "ICP Scout",       title: "Surfaced candidate",     meta: "harmonic.search · SaaS, Series B, 200–800 hc",      stat: "+14 accounts" },
  { time: "12:04:28", tone: "found", agent: "Signal Watcher",  title: "Funding event detected", meta: "Mercury · $300M Series C · TechCrunch",               stat: "score +8"     },
  { time: "12:04:22", tone: "warn",  agent: "Buyer Intel",     title: "Enrichment partial",     meta: "Apollo returned 4/7 contacts for Rippling",           stat: "4 contacts"   },
  { time: "12:04:15", tone: "block", agent: "ICP Scout",       title: "Negative ICP match",     meta: "cohere.com · flagged via negative ICP rule",          stat: "blocked"      },
  { time: "12:04:10", tone: "run",   agent: "Sequence Author", title: "Draft ready for review", meta: "Series B Trigger Play · 5 steps · 10 days",           stat: "draft"        },
  { time: "12:03:58", tone: "found", agent: "ICP Scout",       title: "Surfaced candidate",     meta: "harmonic.search · SaaS, Series A, 500 hc",           stat: "+6 accounts"  },
  { time: "12:03:44", tone: "found", agent: "Buyer Intel",     title: "Committee mapped",       meta: "Linear · VP Sales + CRO + RevOps Director",           stat: "3 personas"   },
  { time: "12:03:30", tone: "warn",  agent: "Signal Watcher",  title: "Low-signal period",      meta: "No new funding events in last 4h window",             stat: "—"            },
  { time: "12:03:12", tone: "found", agent: "ICP Scout",       title: "Tech stack match",       meta: "Vercel · Salesforce + Outreach detected",             stat: "score 87"     },
  { time: "12:02:54", tone: "block", agent: "Buyer Intel",     title: "Rate limit hit",         meta: "Apollo bulk API · retry scheduled in 2 min",         stat: "queued"       },
];

export const mockAgents: AgentsResponse = {
  agents: [
    { id: "icp-scout",       name: "ICP Scout",       status: "running", description: "Surfaces & scores candidate accounts",               runs: "284 runs",  icon: "target"   },
    { id: "buyer-intel",     name: "Buyer Intel",     status: "running", description: "Maps the buying committee per account",              runs: "47 runs",   icon: "users"    },
    { id: "signal-watcher",  name: "Signal Watcher",  status: "running", description: "Polls funding, hiring, tech-stack signals",          runs: "ongoing",   icon: "activity" },
    { id: "sequence-author", name: "Sequence Author", status: "idle",    description: "Drafts outbound plays grounded in your voice",       runs: "12 runs",   icon: "send"     },
  ],
  events: BASE_EVENTS.map((e) => ({ ...e, id: nextId() })),
};
