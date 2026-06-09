import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAccounts } from "./hooks";
import { TierBadge } from "./accountUi";
import type { AccountRecord, AccountsFilters } from "./types";
import { getActiveClientId } from "@/lib/session";

type SortDir = "asc" | "desc";
type TierFilter = "ALL" | "TIER_1" | "TIER_2" | "TIER_3";

const TIER_OPTIONS: { value: TierFilter; label: string }[] = [
  { value: "ALL",    label: "All tiers" },
  { value: "TIER_1", label: "Tier 1"    },
  { value: "TIER_2", label: "Tier 2"    },
  { value: "TIER_3", label: "Tier 3"    },
];

function logoColor(name: string): string {
  const colors = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#3b82f6"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

function ScorePill({ score }: { score: number }) {
  const band = score >= 80 ? "t1" : score >= 60 ? "t2" : "t3";
  return <span className="score-pill" data-band={band}>{score}</span>;
}

export default function AccountsList() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id") ?? getActiveClientId();

  const [search, setSearch]       = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("ALL");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 50;

  const deferredSearch = useDeferredValue(search);

  const queryFilters: AccountsFilters = useMemo(() => ({
    tier: "ALL", minScore: 0, maxScore: 100, search: deferredSearch, sources: [],
  }), [deferredSearch]);

  const accountsQuery = useAccounts({ clientId, filters: queryFilters, page, pageSize: PAGE_SIZE });
  const allAccounts: AccountRecord[] = accountsQuery.data?.accounts ?? [];
  const total      = accountsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const tierCounts = useMemo(() => ({
    ALL:    allAccounts.length,
    TIER_1: allAccounts.filter((a) => a.tier === "TIER_1").length,
    TIER_2: allAccounts.filter((a) => a.tier === "TIER_2").length,
    TIER_3: allAccounts.filter((a) => a.tier === "TIER_3").length,
  }), [allAccounts]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let rows = allAccounts.filter((a) => {
      const matchSearch = !s || a.company_name.toLowerCase().includes(s) || a.domain.toLowerCase().includes(s);
      const matchTier   = tierFilter === "ALL" || a.tier === tierFilter;
      return matchSearch && matchTier;
    });
    rows = [...rows].sort((a, b) =>
      sortDir === "desc" ? b.icp_score - a.icp_score : a.icp_score - b.icp_score
    );
    return rows;
  }, [allAccounts, search, tierFilter, sortDir]);

  if (accountsQuery.isLoading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading accounts" />
      </div>
    );
  }

  if (accountsQuery.isError) {
    return (
      <div className="empty-state" style={{ margin: 24 }}>
        <div className="empty-icon">⚠</div>
        <div className="empty-title">Could not load accounts</div>
        <div className="empty-sub">Check your connection and try again.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", minWidth: 0 }}>
      {/* ── Page Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">ICP Scout</div>
          <h1 className="ph-title">Accounts Dashboard</h1>
          <p className="ph-subtitle">
            Review target companies, scan ICP fit, and narrow the list by tier or name before handing off the next move.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Total</div>
            <div className="ph-kpi-num">{tierCounts.ALL}</div>
          </div>
          <div className="ph-kpi" data-tone="green">
            <div className="ph-kpi-label">Tier 1</div>
            <div className="ph-kpi-num">{tierCounts.TIER_1}</div>
          </div>
          <div className="ph-kpi" data-tone="amber">
            <div className="ph-kpi-label">Tier 2</div>
            <div className="ph-kpi-num">{tierCounts.TIER_2}</div>
          </div>
          <div className="ph-kpi" data-tone="red">
            <div className="ph-kpi-label">Tier 3</div>
            <div className="ph-kpi-num">{tierCounts.TIER_3}</div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="ph-actions">
        <div className="ph-search">
          <span className="ph-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="ph-select"
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value as TierFilter); setPage(1); }}
        >
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          className="btn btn-sm"
          onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
        >
          Score {sortDir === "desc" ? "↓" : "↑"}
        </button>
        <span className="ph-result-count" style={{ marginLeft: "auto", padding: 0 }}>
          <strong>{filtered.length}</strong> of <strong>{total}</strong> accounts
          {totalPages > 1 && <span style={{ color: "var(--text-mute)", marginLeft: 6 }}>· Page {page}/{totalPages}</span>}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ width: "100%", background: "var(--surface)", borderTop: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          tableLayout: "fixed",
          fontSize: 13.5,
        }}>
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              {["Company Name", "Industry", "Location", "ICP Score", "Tier"].map((h) => (
                <th key={h} style={{
                  padding: "12px 20px",
                  textAlign: "left",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-mute)",
                  borderBottom: "2px solid var(--border)",
                  whiteSpace: "nowrap",
                  background: "var(--surface-2)",
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "56px 24px", textAlign: "center" }}>
                  <div className="empty-icon" style={{ margin: "0 auto 12px" }}>
                    {allAccounts.length === 0 ? "📭" : "🔍"}
                  </div>
                  <div className="empty-title">
                    {allAccounts.length === 0 ? "No accounts yet" : "No results match these filters"}
                  </div>
                  <div className="empty-sub">
                    {allAccounts.length === 0
                      ? "Run the ICP Scout agent from the Pipeline page to discover accounts."
                      : "Try adjusting your search or tier filter."}
                  </div>
                </td>
              </tr>
            ) : filtered.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid rgba(228,230,242,0.6)", transition: "background 0.1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ink-50)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "13px 20px", overflow: "hidden" }}>
                  <Link to={`/accounts/${a.id}?client_id=${encodeURIComponent(clientId)}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: logoColor(a.company_name), color: "white",
                      display: "grid", placeItems: "center",
                      fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    }}>
                      {a.company_name[0]}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.company_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-mute)", fontFamily: "var(--font-mono)", marginTop: 1 }}>{a.domain}</div>
                    </div>
                  </Link>
                </td>
                <td style={{ padding: "13px 20px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.industry && a.industry !== "not_found"
                    ? a.industry
                    : <span style={{ color: "var(--text-mute)", fontStyle: "italic", fontSize: 12 }}>Not available</span>}
                </td>
                <td style={{ padding: "13px 20px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.hq_location && a.hq_location !== "not_found"
                    ? a.hq_location
                    : <span style={{ color: "var(--text-mute)", fontStyle: "italic", fontSize: 12 }}>Unknown</span>}
                </td>
                <td style={{ padding: "13px 20px" }}><ScorePill score={a.icp_score} /></td>
                <td style={{ padding: "13px 20px" }}><TierBadge tier={a.tier} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 24px", borderTop: "1px solid var(--border)", background: "var(--surface-2)", width: "100%" }}>
          <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
            <button key={p} className="btn btn-sm" data-variant={p === page ? "primary" : undefined} onClick={() => setPage(p)}>{p}</button>
          ))}
          <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next →</button>
        </div>
      )}
    </div>
  );
}
