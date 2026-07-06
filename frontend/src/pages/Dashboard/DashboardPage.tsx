import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentProgress { processed: number; total: number; }
interface RecentRun {
  agent: string;
  started: string;
  status: "COMPLETED" | "RUNNING" | "FAILED";
  records_processed: number;
  warnings_count: number;
}
interface PipelineStatus {
  agents: {
    icp_scout?: { progress?: AgentProgress };
    signal_intel?: { progress?: AgentProgress };
    storyteller?: { progress?: AgentProgress };
    verifier?: { progress?: AgentProgress };
  };
  recent_runs?: RecentRun[];
}
interface AccountRecord { tier?: string; }
interface AccountListResponse { accounts: AccountRecord[]; total: number; }

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function agentMeta(agent: string): { iconBg: string; iconColor: string; pillBg: string; pillColor: string; pillLabel: string; icon: string } {
  if (agent.toLowerCase().includes("icp") || agent.toLowerCase().includes("scout"))
    return { iconBg: "#eef1f5", iconColor: "#475569", pillBg: "#eef1f5", pillColor: "#475569", pillLabel: "Sourced", icon: "⌂" };
  if (agent.toLowerCase().includes("signal"))
    return { iconBg: "#fbf1e3", iconColor: "#b45309", pillBg: "#fbf1e3", pillColor: "#b45309", pillLabel: "High intent", icon: "◉" };
  if (agent.toLowerCase().includes("story"))
    return { iconBg: "#eef0fb", iconColor: "#4338ca", pillBg: "#eef0fb", pillColor: "#4338ca", pillLabel: "Drafted", icon: "✉" };
  return { iconBg: "#e6f4ee", iconColor: "#047857", pillBg: "#e6f4ee", pillColor: "#047857", pillLabel: "Verified", icon: "✓" };
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ w = "100%", h = 20, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec", opacity: 0.8 }} />;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, iconBg, iconColor, icon, loading }: {
  label: string; value: number | undefined; iconBg: string; iconColor: string; icon: React.ReactNode; loading: boolean;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "16px 17px", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: iconBg, display: "grid", placeItems: "center", color: iconColor }}>{icon}</div>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: "#8a8f9e" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        {loading ? <Skeleton w={60} h={27} /> : (
          <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.02em" }}>{(value ?? 0).toLocaleString()}</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "#a3a7b3", marginTop: 5 }}>vs. previous 30 days</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const clientId = getActiveClientId();
  const [filter, setFilter] = useState("All");

  const { data: pipelineStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["pipeline-status", clientId],
    queryFn: async () => {
      const { data } = await api.get<PipelineStatus>("/api/pipeline/status", { params: { client_id: clientId } });
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: accountsResp, isLoading: accountsLoading } = useQuery({
    queryKey: ["dashboard-accounts", clientId],
    queryFn: async () => {
      const { data } = await api.get<AccountListResponse>("/api/accounts", { params: { client_id: clientId, page_size: 1000 } });
      return data;
    },
    refetchInterval: 60_000,
  });

  const accountsList = accountsResp?.accounts ?? [];
  const tierCounts = {
    T1: accountsList.filter(a => a.tier === "T1" || a.tier === "TIER_1").length,
    T2: accountsList.filter(a => a.tier === "T2" || a.tier === "TIER_2").length,
    T3: accountsList.filter(a => a.tier === "T3" || a.tier === "TIER_3").length,
    total: accountsResp?.total ?? accountsList.length,
  };
  const maxTier = Math.max(tierCounts.T1, tierCounts.T2, tierCounts.T3, 1);

  const kpis = {
    accountsSourced: pipelineStatus?.agents?.icp_scout?.progress?.processed,
    signalsDetected: pipelineStatus?.agents?.signal_intel?.progress?.processed,
    emailsDrafted: pipelineStatus?.agents?.storyteller?.progress?.processed,
    verifiedContacts: pipelineStatus?.agents?.verifier?.progress?.processed,
  };

  const allRuns = pipelineStatus?.recent_runs ?? [];
  const FILTER_TABS = ["All", "ICP Scout", "Buyer Intel", "Signals", "Storyteller"];
  const filteredRuns = filter === "All" ? allRuns : allRuns.filter(r => r.agent.toLowerCase().includes(filter.toLowerCase().split(" ")[0]));

  const tierConfig = [
    { label: "Tier 1 — Highest fit", sub: "", count: tierCounts.T1, color: "#4338ca", width: `${(tierCounts.T1 / maxTier) * 100}%` },
    { label: "Tier 2 — Good fit", sub: "", count: tierCounts.T2, color: "#8b5cf6", width: `${(tierCounts.T2 / maxTier) * 100}%` },
    { label: "Tier 3 — Possible fit", sub: "", count: tierCounts.T3, color: "#06b6d4", width: `${(tierCounts.T3 / maxTier) * 100}%` },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Dashboard</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>Account intelligence across your active pipeline</p>
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ height: 36, padding: "0 14px", border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 500, color: "#3a3f4c", display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
          Last 30 days
        </button>
        <button style={{ height: 36, padding: "0 15px", border: "1px solid #4338ca", background: "#4338ca", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export report
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
        <KpiCard label="Accounts Sourced" value={kpis.accountsSourced} iconBg="#eef0fb" iconColor="#4338ca" loading={statusLoading}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/></svg>} />
        <KpiCard label="Signals Detected" value={kpis.signalsDetected} iconBg="#fbf1e3" iconColor="#b45309" loading={statusLoading}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5a6.4 6.4 0 0 1 0 9M7.5 16.5a6.4 6.4 0 0 1 0-9"/></svg>} />
        <KpiCard label="Emails Drafted" value={kpis.emailsDrafted} iconBg="#eef0fb" iconColor="#4338ca" loading={statusLoading}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>} />
        <KpiCard label="Verified Contacts" value={kpis.verifiedContacts} iconBg="#e6f4ee" iconColor="#047857" loading={statusLoading}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a4 4 0 1 0-8 0"/><path d="M4 20a6 6 0 0 1 11.3-2.8"/><path d="m16 18 2 2 4-4"/></svg>} />
      </div>

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, alignItems: "start" }}>

        {/* Recent Activity */}
        <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 18px 13px", borderBottom: "1px solid #eeeeea" }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Recent Activity</h2>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 5 }}>
              {FILTER_TABS.map(t => (
                <button key={t} onClick={() => setFilter(t)} style={{ height: 27, padding: "0 11px", border: `1px solid ${filter === t ? "#4338ca" : "#e3e3df"}`, background: filter === t ? "#eef0fb" : "#fff", color: filter === t ? "#4338ca" : "#6b7180", borderRadius: 6, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 500 }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            {statusLoading && Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 13, padding: "13px 18px", borderBottom: "1px solid #f2f2ee" }}>
                <Skeleton w={32} h={32} r={7} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skeleton w="60%" h={14} />
                  <Skeleton w="80%" h={12} />
                </div>
              </div>
            ))}
            {!statusLoading && filteredRuns.map((run, i) => {
              const meta = agentMeta(run.agent);
              return (
                <div key={i} style={{ display: "flex", gap: 13, padding: "13px 18px", borderBottom: "1px solid #f2f2ee" }}>
                  <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 7, background: meta.iconBg, color: meta.iconColor, display: "grid", placeItems: "center", marginTop: 1, fontSize: 15 }}>{meta.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{run.agent}</span>
                      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: meta.pillBg, color: meta.pillColor }}>{meta.pillLabel}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#8a8f9e", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {run.records_processed} records processed{run.warnings_count > 0 ? ` · ${run.warnings_count} warnings` : ""}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 11.5, color: "#a3a7b3", whiteSpace: "nowrap", marginTop: 2 }}>{relativeTime(run.started)}</div>
                </div>
              );
            })}
            {!statusLoading && filteredRuns.length === 0 && (
              <div style={{ padding: "46px 18px", textAlign: "center", color: "#a3a7b3", fontSize: 13 }}>No activity matches your filters.</div>
            )}
          </div>
        </section>

        {/* Pipeline by Tier */}
        <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "16px 18px 18px" }}>
          <h2 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600 }}>Pipeline by Tier</h2>
          <p style={{ margin: "0 0 18px", fontSize: 12, color: "#8a8f9e" }}>{tierCounts.total} accounts in active pipeline</p>

          {(statusLoading || accountsLoading) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[1, 2, 3].map(i => <Skeleton key={i} h={28} />)}
            </div>
          ) : (
            tierConfig.map(tier => (
              <div key={tier.label} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: tier.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tier.label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tier.count}</span>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: "#f0f0ec", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: tier.width, borderRadius: 5, background: tier.color, transition: "width .5s ease" }} />
                </div>
              </div>
            ))
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eeeeea" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
              <span style={{ fontSize: 12, color: "#8a8f9e" }}>Avg. fit score</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>—<span style={{ color: "#a3a7b3", fontWeight: 500 }}>/100</span></span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
              <span style={{ fontSize: 12, color: "#8a8f9e" }}>Active signals</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>—</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#8a8f9e" }}>Ready for outreach</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: "#047857" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
                {tierCounts.T1}
              </span>
            </div>
          </div>
          <button onClick={() => navigate("/accounts")} style={{ marginTop: 18, width: "100%", height: 36, border: "1px solid #4338ca", background: "#4338ca", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#fff" }}>
            View full pipeline
          </button>
        </section>
      </div>
    </div>
  );
}
