import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

interface Account {
  id?: string;
  name?: string;
  company_name?: string;
  domain?: string;
  industry?: string;
  tier?: string;
  icp_score?: number;
  status?: string;
}
interface AccountListResponse { accounts: Account[]; total: number; }

function tierDisplay(tier: string | undefined) {
  if (!tier) return { label: "—", bg: "#f0f0ec", color: "#6b7180" };
  const t = tier.toUpperCase();
  if (t === "T1" || t === "TIER_1") return { label: "T1", bg: "#e9eafb", color: "#4338ca" };
  if (t === "T2" || t === "TIER_2") return { label: "T2", bg: "#f1edfb", color: "#7c3aed" };
  return { label: "T3", bg: "#f0f0ec", color: "#6b7180" };
}

function tierFilterValue(tier: string | undefined): string {
  if (!tier) return "";
  const t = tier.toUpperCase();
  if (t === "T1" || t === "TIER_1") return "T1";
  if (t === "T2" || t === "TIER_2") return "T2";
  return "T3";
}

function scoreColor(score: number | undefined) {
  if (!score) return "#c4c4be";
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#c4c4be";
}

function statusDisplay(status: string | undefined) {
  if (!status) return { label: "Unknown", bg: "#f0f0ec", color: "#6b7180" };
  const s = status.toLowerCase();
  if (s === "engaged") return { label: "Engaged", bg: "#e6f4ee", color: "#047857" };
  if (s.includes("sequence")) return { label: "In sequence", bg: "#eef0fb", color: "#4338ca" };
  if (s === "stalled") return { label: "Stalled", bg: "#fbf1e3", color: "#b45309" };
  if (s === "removed") return { label: "Removed", bg: "#fdeef0", color: "#be123c" };
  return { label: status, bg: "#f0f0ec", color: "#6b7180" };
}

function acctInitials(name: string | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function Skeleton({ w = "100%", h = 16, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec" }} />;
}

const TIER_TABS = ["All", "Tier 1", "Tier 2", "Tier 3", "Removed"];

export default function AccountsPage() {
  const navigate = useNavigate();
  const clientId = getActiveClientId();
  const [tierFilter, setTierFilter] = useState("All");

  const { data, isLoading } = useQuery({
    queryKey: ["accounts", clientId],
    queryFn: async () => {
      const { data } = await api.get<AccountListResponse>("/api/accounts", {
        params: { client_id: clientId, page_size: 100 },
      });
      return data;
    },
  });

  const accounts = data?.accounts ?? [];

  const filtered = accounts.filter(a => {
    if (tierFilter === "All") return true;
    if (tierFilter === "Removed") return a.status?.toLowerCase() === "removed";
    const tv = tierFilterValue(a.tier);
    if (tierFilter === "Tier 1") return tv === "T1";
    if (tierFilter === "Tier 2") return tv === "T2";
    if (tierFilter === "Tier 3") return tv === "T3";
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Accounts</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>
            {isLoading ? "Loading…" : `${data?.total ?? accounts.length} scored accounts in your pipeline`}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ height: 36, padding: "0 15px", border: "1px solid #4338ca", background: "#4338ca", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add accounts
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 5 }}>
          {TIER_TABS.map(t => (
            <button key={t} onClick={() => setTierFilter(t)} style={{ height: 32, padding: "0 13px", border: `1px solid ${tierFilter === t ? "#4338ca" : "#e3e3df"}`, background: tierFilter === t ? "#eef0fb" : "#fff", color: tierFilter === t ? "#4338ca" : "#6b7180", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 500 }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ height: 32, padding: "0 13px", border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 500, color: "#3a3f4c", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></svg>
          Status
        </button>
      </div>

      <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.4fr 1.6fr 0.7fr 1.1fr 1fr 28px", gap: 14, padding: "11px 18px", borderBottom: "1px solid #eeeeea", fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: "#a3a7b3" }}>
          <span>Account</span><span>Industry</span><span>Tier</span><span>Score</span><span>Status</span><span />
        </div>

        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2.4fr 1.6fr 0.7fr 1.1fr 1fr 28px", gap: 14, alignItems: "center", padding: "13px 18px", borderBottom: "1px solid #f2f2ee" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Skeleton w={30} h={30} r={7} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                <Skeleton w="70%" h={13} /><Skeleton w="50%" h={11} />
              </div>
            </div>
            <Skeleton w="60%" h={13} />
            <Skeleton w={30} h={20} r={6} />
            <Skeleton w="80%" h={13} />
            <Skeleton w={70} h={20} r={20} />
            <span />
          </div>
        ))}

        {!isLoading && filtered.map((acct, i) => {
          const name = acct.name ?? acct.company_name ?? "Unknown";
          const tier = tierDisplay(acct.tier);
          const stat = statusDisplay(acct.status);
          const score = acct.icp_score ?? 0;
          const id = acct.id ?? acct.domain ?? String(i);
          return (
            <div
              key={i}
              onClick={() => navigate(`/accounts/${id}`)}
              style={{ display: "grid", gridTemplateColumns: "2.4fr 1.6fr 0.7fr 1.1fr 1fr 28px", gap: 14, alignItems: "center", padding: "13px 18px", borderBottom: "1px solid #f2f2ee", cursor: "pointer", transition: "background .1s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f4f4fb")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 7, background: "#f0f0ec", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#6b7180" }}>{acctInitials(name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                  <div style={{ fontSize: 11.5, color: "#a3a7b3" }}>{acct.domain ?? ""}</div>
                </div>
              </div>
              <span style={{ fontSize: 13, color: "#3a3f4c" }}>{acct.industry ?? "—"}</span>
              <span><span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: tier.bg, color: tier.color }}>{tier.label}</span></span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, width: 22 }}>{score || "—"}</span>
                <div style={{ flex: 1, height: 5, maxWidth: 60, borderRadius: 4, background: "#f0f0ec", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(score, 100)}%`, background: scoreColor(score) }} />
                </div>
              </div>
              <span><span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: stat.bg, color: stat.color }}>{stat.label}</span></span>
              <span style={{ display: "grid", placeItems: "center", color: "#c4c4be" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </span>
            </div>
          );
        })}

        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: "46px 18px", textAlign: "center", color: "#a3a7b3", fontSize: 13 }}>No accounts match this filter.</div>
        )}
      </section>
    </div>
  );
}
