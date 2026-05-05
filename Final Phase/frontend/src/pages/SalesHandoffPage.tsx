import { useState, useMemo } from "react";
import { EngagementScore } from "../components/ui/EngagementScore";
import { EmptyState } from "../components/ui";
import {
  mockEnrichedLeads,
  type EnrichedLead,
  type TimelineEvent,
  type TimelineEventType,
} from "../mocks/salesLeads";

const TIMELINE_ICONS: Record<TimelineEventType, string> = {
  email_opened: "📧",
  email_replied: "↩️",
  linkedin_accepted: "🤝",
  linkedin_replied: "💬",
  whatsapp_replied: "📱",
  meeting_booked: "📅",
};

const STATUS_CONFIG: Record<EnrichedLead["status"], { label: string; cls: string }> = {
  new: { label: "New Lead", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  accepted: { label: "Accepted", cls: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700 border-red-200" },
  nurturing: { label: "Nurturing", cls: "bg-blue-100 text-blue-700 border-blue-200" },
};

function TimelineRow({ ev }: { ev: TimelineEvent }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${ev.completed ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"}`} />
      <div>
        <div className="flex items-center gap-1.5">
          <span>{TIMELINE_ICONS[ev.type]}</span>
          <span className={`text-xs font-semibold ${ev.completed ? "text-slate-800" : "text-slate-400"}`}>{ev.label}</span>
          {ev.completed && <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-700">✓</span>}
        </div>
        {ev.detail && <p className={`mt-0.5 text-[11px] ${ev.completed ? "text-slate-500" : "text-slate-400"}`}>{ev.detail}</p>}
      </div>
    </li>
  );
}

function ConversationModal({ lead, onClose }: { lead: EnrichedLead; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{lead.fullName}</h3>
            <p className="text-sm text-slate-500">{lead.title} · {lead.company}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        {lead.conversationSnippet ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Latest message</p>
            <p className="text-sm italic text-slate-700">"{lead.conversationSnippet}"</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No conversation recorded yet.</p>
        )}
        <div className="mt-4 flex gap-2">
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
              📧 Email
            </a>
          )}
          {lead.linkedinUrl && (
            <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm font-medium text-blue-700 hover:bg-blue-100 transition">
              🔗 LinkedIn
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead, onView }: { lead: EnrichedLead; onView: (l: EnrichedLead) => void }) {
  const [open, setOpen] = useState(false);
  const isHot = lead.engagementScore >= 60;
  const status = STATUS_CONFIG[lead.status];
  const done = lead.timeline.filter((e) => e.completed).length;

  return (
    <div className={`relative rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${isHot ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}>
      {isHot && (
        <div className="absolute -top-2.5 left-4 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-0.5 text-[11px] font-bold text-white shadow-sm">
          ⭐ Hot Lead
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent to-blue-400 text-sm font-bold text-white shadow">
              {lead.fullName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900">{lead.fullName}</p>
              <p className="truncate text-xs text-slate-500">{lead.title} · {lead.company}</p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.cls}`}>{status.label}</span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">{lead.industry}</span>
          <span className="text-[11px] text-slate-400">{done}/{lead.timeline.length} touchpoints</span>
        </div>

        <div className="mt-4">
          <EngagementScore score={lead.engagementScore} size="md" showLabel animated />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">🤖 AI Handoff Note</p>
          <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">{lead.handoffNote}</p>
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-600">Why qualified: </span>{lead.qualificationReason}
        </p>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <button
            id={`timeline-toggle-${lead.contactId}`}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-xs font-semibold text-slate-700">📋 Engagement Timeline</span>
            <span className="text-xs text-slate-400">{open ? "▲ Collapse" : "▼ Expand"}</span>
          </button>
          {open && (
            <ul className="mt-3 space-y-3">
              {lead.timeline.map((ev) => <TimelineRow key={ev.type} ev={ev} />)}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <button
            id={`view-convo-${lead.contactId}`}
            onClick={() => onView(lead)}
            className="w-full rounded-lg border border-brand-accent bg-white px-3 py-2 text-xs font-semibold text-brand-accent transition hover:bg-brand-light"
          >
            View Full Conversation
          </button>
        </div>
      </div>
    </div>
  );
}

type SortKey = "score_desc" | "score_asc" | "name_asc";

export function SalesHandoffPage() {
  const [sortKey, setSortKey] = useState<SortKey>("score_desc");
  const [filterHot, setFilterHot] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<EnrichedLead | null>(null);

  const leads = mockEnrichedLeads;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...leads]
      .filter((l) => {
        const matchSearch = !term || l.fullName.toLowerCase().includes(term) || l.company.toLowerCase().includes(term);
        return matchSearch && (filterHot ? l.engagementScore >= 60 : true);
      })
      .sort((a, b) => {
        if (sortKey === "score_desc") return b.engagementScore - a.engagementScore;
        if (sortKey === "score_asc") return a.engagementScore - b.engagementScore;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [leads, search, filterHot, sortKey]);

  const hotCount = leads.filter((l) => l.engagementScore >= 60).length;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-accent">Sales Pipeline</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Sales Handoff Panel</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Review AI-enriched lead cards with full engagement timelines and handoff notes.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-2xl font-bold text-brand-accent">{hotCount}</span>
            <span className="text-sm text-slate-500">hot leads ready</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          id="handoff-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or company…"
          className="min-w-[200px] flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
          <input type="checkbox" checked={filterHot} onChange={(e) => setFilterHot(e.target.checked)} className="h-4 w-4 rounded" />
          Score ≥ 60 only
        </label>
        <select
          id="handoff-sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none"
        >
          <option value="score_desc">Score: High → Low</option>
          <option value="score_asc">Score: Low → High</option>
          <option value="name_asc">Name: A → Z</option>
        </select>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} leads</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="🔍" heading="No leads found" subtext="Try adjusting your search or filters." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lead) => (
            <LeadCard key={lead.contactId} lead={lead} onView={setModal} />
          ))}
        </div>
      )}

      {modal && <ConversationModal lead={modal} onClose={() => setModal(null)} />}
    </section>
  );
}
