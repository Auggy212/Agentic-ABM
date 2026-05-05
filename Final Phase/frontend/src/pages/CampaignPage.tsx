import { useMemo, useState } from "react";
import { useCampaignReportQuery } from "../api/api";
import { LoadingSpinner } from "../components/ui";
import { EngagementScore } from "../components/ui/EngagementScore";
import { CampaignCharts } from "../components/CampaignCharts";
import { mockCampaignKPIs } from "../mocks/salesLeads";
import type { CampaignReportResponse } from "../types/api.types";

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  gradient: string;
  textColor: string;
}

function KpiCard({ icon, label, value, sub, gradient, textColor }: KpiCardProps) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-white/20 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide opacity-75 ${textColor}`}>{label}</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${textColor}`}>{value}</p>
          {sub && <p className={`mt-1 text-xs opacity-70 ${textColor}`}>{sub}</p>}
        </div>
        <span className="text-2xl opacity-80 transition-transform duration-200 group-hover:scale-110">{icon}</span>
      </div>
      {/* Subtle glow ring on hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 ring-2 ring-white/30 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function CampaignPage() {
  const [highEngagementOnly, setHighEngagementOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const { data, isLoading, isError, isFetching, refetch } = useCampaignReportQuery({
    select: (response: CampaignReportResponse) => response,
  });

  const contacts = useMemo(() => data?.contacts ?? [], [data?.contacts]);

  const filteredContacts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...contacts]
      .filter((c) => {
        const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q);
        const matchScore = highEngagementOnly ? c.engagementScore > 50 : true;
        return matchSearch && matchScore;
      })
      .sort((a, b) =>
        sortDirection === "desc"
          ? b.engagementScore - a.engagementScore
          : a.engagementScore - b.engagementScore
      );
  }, [contacts, highEngagementOnly, searchTerm, sortDirection]);

  const kpis = mockCampaignKPIs;

  return (
    <section className="space-y-6">
      {/* Page header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-accent">Analytics</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Campaign Dashboard</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Track engagement metrics, visualise channel performance, and surface leads most worth a handoff.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase text-slate-400">Last updated</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">
              {data?.generatedAt
                ? new Date(data.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                : "Using mock data"}
            </p>
          </div>
        </div>
      </div>

      {/* KPI grid and charts always render immediately from mock data */}
      <KpiGrid kpis={kpis} />
      <CampaignCharts />

      {isError && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <span>⚠️</span>
          <span>Live API unavailable — contact table shows mock data.</span>
          <button onClick={() => void refetch()} className="ml-auto rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-50 transition">Retry</button>
        </div>
      )}

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <>
          {/* Contact table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search contacts…"
                  className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                />
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={highEngagementOnly}
                    onChange={(e) => setHighEngagementOnly(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  High engagement only
                </label>
                <button
                  type="button"
                  onClick={() => setSortDirection((d) => (d === "desc" ? "asc" : "desc"))}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Score {sortDirection === "desc" ? "↓" : "↑"}
                </button>
                {isFetching && <LoadingSpinner size="sm" label="Refreshing…" />}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {["Name", "Company", "Email Opens", "Replies", "LinkedIn", "WhatsApp", "Engagement Score"].map((col) => (
                      <th key={col} className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                        No contacts match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredContacts.map((c) => (
                      <tr
                        key={c.contactId}
                        className={`transition-colors hover:bg-slate-50 ${c.engagementScore > 75 ? "bg-amber-50/40" : ""}`}
                      >
                        <td className="whitespace-nowrap px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand-primary">
                              {c.name?.charAt(0) ?? "?"}
                            </div>
                            <span className="font-semibold text-slate-900">{c.name}</span>
                            {c.engagementScore > 75 && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⭐</span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{c.company}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{c.emailOpens}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{c.replies}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{c.linkedinActions}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{c.whatsappReplies}</td>
                        <td className="px-5 py-4">
                          <div className="w-32">
                            <EngagementScore score={c.engagementScore} size="sm" showLabel={false} animated />
                            <span className="mt-1 block text-center text-[11px] font-bold text-slate-600">{c.engagementScore}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI grid sub-component
// ─────────────────────────────────────────────────────────────────────────────

function KpiGrid({ kpis }: { kpis: typeof mockCampaignKPIs }) {
  const cards: KpiCardProps[] = [
    {
      icon: "📨",
      label: "Emails Delivered",
      value: kpis.totalDelivered,
      gradient: "bg-gradient-to-br from-brand-primary to-blue-700",
      textColor: "text-white",
    },
    {
      icon: "👁",
      label: "Open Rate",
      value: `${kpis.openRate}%`,
      sub: "of delivered emails",
      gradient: "bg-gradient-to-br from-blue-500 to-cyan-500",
      textColor: "text-white",
    },
    {
      icon: "↩️",
      label: "Reply Rate",
      value: `${kpis.replyRate}%`,
      sub: "of delivered emails",
      gradient: "bg-gradient-to-br from-violet-500 to-purple-600",
      textColor: "text-white",
    },
    {
      icon: "📅",
      label: "Meetings Booked",
      value: kpis.meetingsBooked,
      gradient: "bg-gradient-to-br from-emerald-500 to-green-600",
      textColor: "text-white",
    },
    {
      icon: "🎯",
      label: "SQLs Created",
      value: kpis.sqlCreated,
      gradient: "bg-gradient-to-br from-amber-400 to-orange-500",
      textColor: "text-white",
    },
    {
      icon: "🤝",
      label: "Handoffs Accepted",
      value: kpis.handoffsAccepted,
      gradient: "bg-gradient-to-br from-pink-500 to-rose-500",
      textColor: "text-white",
    },
    {
      icon: "⚡",
      label: "Avg Engagement",
      value: kpis.avgEngagementScore,
      sub: "score out of 100",
      gradient: "bg-gradient-to-br from-slate-700 to-slate-900",
      textColor: "text-white",
    },
    {
      icon: "🔥",
      label: "Active Leads",
      value: kpis.activeLeads,
      sub: "in pipeline now",
      gradient: "bg-gradient-to-br from-teal-500 to-cyan-600",
      textColor: "text-white",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}
