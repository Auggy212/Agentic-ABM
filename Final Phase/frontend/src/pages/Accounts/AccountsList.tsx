import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Btn from "@/components/ui/Btn";
import Icon from "@/components/ui/Icon";
import Logo from "@/components/ui/Logo";
import ScoreViz, { scoreBand } from "@/components/ui/ScoreViz";
import Sparkline from "@/components/ui/Sparkline";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Checkpoint1Banner from "./Checkpoint1Banner";
import RemoveAccountModal from "./RemoveAccountModal";
import { useAccounts, useApproveCheckpoint1, useRemoveAccount } from "./hooks";
import { TierBadge, SourceBadge, formatHeadcount } from "./accountUi";
import type { AccountRecord, AccountsFilters, DataSource } from "./types";
import type { ScoreStyle } from "@/components/ui/ScoreViz";

const DEFAULT_CLIENT_ID = "12345678-1234-5678-1234-567812345678";
const ALL_TIERS = ["ALL", "TIER_1", "TIER_2", "TIER_3"] as const;
const SOURCE_OPTIONS: DataSource[] = ["APOLLO", "HARMONIC", "CRUNCHBASE", "BUILTWITH", "CLIENT_UPLOAD"];

type SortKey = "company_name" | "domain" | "industry" | "headcount" | "hq_location" | "funding_stage" | "icp_score" | "tier" | "source";
type SortDir = "asc" | "desc";

function toggleSource(current: DataSource[], source: DataSource) {
  return current.includes(source) ? current.filter((s) => s !== source) : [...current, source];
}
function normalizeForSort(value: string | number | "not_found") {
  if (value === "not_found") return Number.NEGATIVE_INFINITY;
  return typeof value === "string" ? value.toLowerCase() : value;
}
function downloadCsv(rows: AccountRecord[]) {
  const headers = ["Company Name","Domain","Industry","Headcount","HQ Location","Funding Stage","ICP Score","Tier","Source"];
  const escape = (v: string | number) => `"${String(v).split('"').join('""')}"`;
  const lines = [headers.join(","), ...rows.map((a) => [
    escape(a.company_name), escape(a.domain), escape(a.industry),
    escape(a.headcount === "not_found" ? "N/A" : a.headcount),
    escape(a.hq_location), escape(a.funding_stage), escape(a.icp_score),
    escape(a.tier), escape(a.source),
  ].join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "abm-accounts.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

// Deterministic logo colors per domain
const PALETTE = ["#3d3ee0","#1d6e3b","#c84a18","#2a2e3a","#a23811","#3a5f33","#7c2a0d","#2a2a90","#4a7740","#5b1f0a"];
function logoColor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return PALETTE[h % PALETTE.length]; }

function Th({ label, sortKey, currentKey, currentDir, onSort }: { label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir; onSort: (k: SortKey) => void }) {
  const active = currentKey === sortKey;
  return (
    <th>
      <button onClick={() => onSort(sortKey)}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3 }}>{active ? (currentDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

interface Props { scoreStyle?: ScoreStyle; }

export default function AccountsList({ scoreStyle = "bar" }: Props) {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id") ?? DEFAULT_CLIENT_ID;

  const [filters, setFilters] = useState<AccountsFilters>({ tier: "ALL", minScore: 0, maxScore: 100, search: "", sources: [] });
  const deferredSearch = useDeferredValue(filters.search);
  const [sortKey, setSortKey] = useState<SortKey>("icp_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [targetAccounts, setTargetAccounts] = useState<AccountRecord[]>([]);

  const queryFilters = useMemo(() => ({ ...filters, search: deferredSearch }), [deferredSearch, filters]);
  const accountsQuery = useAccounts({ clientId, filters: queryFilters });
  const removeAccount = useRemoveAccount();
  const approveCheckpoint = useApproveCheckpoint1(clientId);

  const allAccounts = accountsQuery.data?.accounts ?? [];
  const meta = accountsQuery.data?.meta;

  const preTier = useMemo(() => allAccounts.filter((a) => {
    const s = filters.search.trim().toLowerCase();
    return (!s || a.company_name.toLowerCase().includes(s) || a.domain.toLowerCase().includes(s))
      && a.icp_score >= filters.minScore && a.icp_score <= filters.maxScore
      && (filters.sources.length === 0 || filters.sources.includes(a.source));
  }), [allAccounts, filters]);

  const tierCounts = useMemo(() => ({
    ALL: preTier.length,
    TIER_1: preTier.filter((a) => a.tier === "TIER_1").length,
    TIER_2: preTier.filter((a) => a.tier === "TIER_2").length,
    TIER_3: preTier.filter((a) => a.tier === "TIER_3").length,
  }), [preTier]);

  const filtered = useMemo(() => {
    const narrowed = filters.tier === "ALL" ? preTier : preTier.filter((a) => a.tier === filters.tier);
    return [...narrowed].sort((l, r) => {
      const lv = sortKey === "tier" ? l.icp_score : normalizeForSort(l[sortKey as keyof AccountRecord] as string | number | "not_found");
      const rv = sortKey === "tier" ? r.icp_score : normalizeForSort(r[sortKey as keyof AccountRecord] as string | number | "not_found");
      if (lv < rv) return sortDir === "asc" ? -1 : 1;
      if (lv > rv) return sortDir === "asc" ? 1 : -1;
      return l.company_name.localeCompare(r.company_name);
    });
  }, [filters.tier, preTier, sortDir, sortKey]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((a) => selectedIds.includes(a.id));

  function handleSort(k: SortKey) {
    if (k === sortKey) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(k);
    setSortDir(k === "company_name" ? "asc" : "desc");
  }
  function openRemoveModal(accounts: AccountRecord[]) { setTargetAccounts(accounts); setRemoveModalOpen(true); }
  async function handleRemove(reason: string) {
    for (const a of targetAccounts) await removeAccount.mutateAsync({ id: a.id, reason });
    setSelectedIds((c) => c.filter((id) => !targetAccounts.some((a) => a.id === id)));
    setRemoveModalOpen(false); setTargetAccounts([]);
  }

  if (accountsQuery.isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading accounts" />
      </div>
    );
  }
  if (accountsQuery.isError) {
    return (
      <div style={{ padding: 40 }}>
        <div className="card card-pad" style={{ background: "var(--bad-50)", borderColor: "color-mix(in srgb, var(--bad-500) 30%, transparent)" }}>
          <h2 style={{ color: "var(--bad-700)", margin: 0 }}>Couldn't load the account list</h2>
          <p style={{ color: "var(--bad-700)", marginTop: 6, fontSize: 13 }}>The Human Checkpoint view needs account data before Phase 2 can continue.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="page-head">
        <div>
          <div className="page-head-meta">Human checkpoint 1 · Phase 2 locked</div>
          <h1>ICP Scout Account Review</h1>
        </div>
        <div className="page-head-actions">
          <Btn variant="ghost" icon="download" size="sm" onClick={() => downloadCsv(filtered)}>Export</Btn>
          <Btn variant="ghost" icon="settings" size="sm">Columns</Btn>
          <Btn
            variant="primary"
            icon="check"
            size="sm"
            loading={approveCheckpoint.isPending}
            onClick={() => approveCheckpoint.mutateAsync()}
          >
            Approve &amp; start Phase 2
          </Btn>
        </div>
      </div>

      <div className="page-body">
        {/* KPI strip */}
        <div className="kpi-row">
          {[
            { label: "Tier 1 accounts",  num: String(tierCounts.TIER_1), delta: "this run" },
            { label: "Tier 2 accounts",  num: String(tierCounts.TIER_2), delta: "need review" },
            { label: "Total accounts",   num: String(tierCounts.ALL),    delta: "surfaced" },
            { label: "Sources active",   num: "5",                       delta: "Apollo · Harmonic · …" },
          ].map((k, i) => (
            <div className="kpi" key={i}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-num">{k.num}</div>
              <div className="kpi-delta">↗ {k.delta}</div>
              <div className="kpi-spark"><Sparkline /></div>
            </div>
          ))}
        </div>

        {/* Checkpoint banners */}
        {meta?.run_status === "needs_review" && (
          <div style={{ marginBottom: 18 }}>
            <Checkpoint1Banner
              flaggedCount={meta.flagged_accounts ?? filtered.filter((a) => a.tier !== "TIER_1").length}
              phase2Locked={meta.phase_2_locked ?? true}
              approving={approveCheckpoint.isPending}
              onApprove={() => approveCheckpoint.mutateAsync()}
              onExport={() => downloadCsv(filtered)}
            />
          </div>
        )}
        {meta?.run_status === "approved" && (
          <div className="banner" data-tone="good" style={{ marginBottom: 18 }}>
            <div className="banner-icon"><Icon name="check" size={18} /></div>
            <div className="banner-body">
              <div className="banner-title">Checkpoint 1 approved</div>
              <div className="banner-text">Phase 2 unlocked. Buyer Intel can now proceed from this reviewed list.</div>
            </div>
          </div>
        )}
        {meta?.run_status === "needs_review" && (
          <div className="banner" data-tone="action" style={{ marginBottom: 18 }}>
            <div className="banner-icon"><Icon name="bolt" size={18} /></div>
            <div className="banner-body">
              <div className="banner-title">{tierCounts.TIER_2 + tierCounts.TIER_3} accounts flagged for review before Phase 2 unlocks</div>
              <div className="banner-text">ICP Scout surfaced these because score &lt; 60 or matched a negative-ICP rule. Confirm or remove to continue.</div>
            </div>
            <Btn variant="" size="sm">Review flagged</Btn>
            <Btn variant="primary" size="sm">Approve all Tier 1</Btn>
          </div>
        )}
        {meta?.quota_warnings?.length ? (
          <div className="banner" data-tone="warn" style={{ marginBottom: 18 }}>
            <div className="banner-icon"><Icon name="warn" size={18} /></div>
            <div className="banner-body">
              <div className="banner-title">Quota warning</div>
              <div className="banner-text">{meta.quota_warnings.join(" ")}</div>
            </div>
          </div>
        ) : null}

        {/* Grid */}
        <div className="grid-wrap" style={{ position: "relative" }}>
          {/* Toolbar */}
          <div className="grid-toolbar">
            <div className="grid-toolbar-left">
              <div className="grid-tabs">
                {ALL_TIERS.map((t) => {
                  const label = t === "ALL" ? "All" : `Tier ${t.slice(-1)}`;
                  const count = tierCounts[t];
                  return (
                    <button
                      key={t}
                      className="grid-tab"
                      data-active={String(filters.tier === t)}
                      onClick={() => setFilters((f) => ({ ...f, tier: t }))}
                    >
                      {label}
                      <span className="grid-tab-count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid-search">
                <Icon name="search" size={13} />
                <input
                  aria-label="Search"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Search company or domain"
                />
              </div>
            </div>
            <div className="grid-toolbar-right">
              <Btn variant="ghost" icon="filter" size="sm">Filters · 0</Btn>
              <Btn variant="" icon="plus" size="sm">Add account</Btn>
              <Btn
                variant="danger-ghost"
                size="sm"
                disabled={selectedIds.length === 0}
                onClick={() => openRemoveModal(filtered.filter((a) => selectedIds.includes(a.id)))}
              >
                Remove selected ({selectedIds.length})
              </Btn>
            </div>
          </div>

          {/* Filter rail — source pills */}
          <div className="filter-rail">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 6 }}>Source</span>
            {SOURCE_OPTIONS.map((s) => (
              <button
                key={s}
                className="filter-pill"
                data-active={String(filters.sources.includes(s))}
                onClick={() => setFilters((f) => ({ ...f, sources: toggleSource(f.sources, s) }))}
              >
                {s.replace("CLIENT_", "")}
              </button>
            ))}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 6px 0 16px" }}>Score</span>
            <button className="filter-pill" data-active="true">≥ 80</button>
            <button className="filter-pill">60–79</button>
            <button className="filter-pill">&lt; 60</button>
          </div>

          {/* Table */}
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th className="col-pin" style={{ width: 38 }}>
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={!!allVisibleSelected}
                      onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((a) => a.id) : [])}
                    />
                  </th>
                  <Th label="Company Name" sortKey="company_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <Th label="ICP Score" sortKey="icp_score" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th>Tier</th>
                  <Th label="Industry" sortKey="industry" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <Th label="HC" sortKey="headcount" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <Th label="HQ" sortKey="hq_location" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <Th label="Funding" sortKey="funding_stage" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th>Tech stack</th>
                  <th>Recent signals</th>
                  <Th label="Source" sortKey="source" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-3)" }}>
                      No accounts match these filters.
                    </td>
                  </tr>
                ) : filtered.map((a) => {
                  const sel = selectedIds.includes(a.id);
                  const band = scoreBand(a.icp_score);
                  const mark = a.company_name.slice(0, 2).toUpperCase();
                  const color = logoColor(a.domain);
                  return (
                    <tr key={a.id} data-selected={String(sel)}>
                      <td className="col-pin">
                        <input type="checkbox" className="row-check" checked={sel}
                          onChange={() => setSelectedIds((c) => sel ? c.filter((x) => x !== a.id) : [...c, a.id])} />
                      </td>
                      <td className="col-pin">
                        <div className="cell-company">
                          <button
                            className="cell-fav"
                            data-on={String(favs.has(a.id))}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavs((f) => { const n = new Set(f); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; });
                            }}
                          >
                            <Icon name={favs.has(a.id) ? "star-fill" : "star"} size={13} />
                          </button>
                          <Logo mark={mark} color={color} />
                          <div>
                            <Link className="cell-name" to={`/accounts/${a.id}?client_id=${encodeURIComponent(clientId)}`}>
                              {a.company_name}
                            </Link>
                            <div className="cell-domain">{a.domain}</div>
                          </div>
                        </div>
                      </td>
                      <td><ScoreViz score={a.icp_score} band={band} style={scoreStyle} /></td>
                      <td><TierBadge tier={a.tier} /></td>
                      <td style={{ color: "var(--text-2)" }}>{a.industry}</td>
                      <td className="col-num">{formatHeadcount(a.headcount)}</td>
                      <td style={{ color: "var(--text-2)" }}>{a.hq_location}</td>
                      <td style={{ color: "var(--text-2)" }}>{a.funding_stage}</td>
                      <td>
                        <span className="cell-tech">
                          {a.technologies_used.slice(0, 3).map((t, i) => <span key={i} className="cell-tech-pill">{t}</span>)}
                        </span>
                      </td>
                      <td>
                        <span className="cell-signals">
                          {a.recent_signals.slice(0, 2).map((s, i) => (
                            <span key={i} className="signal-tag" data-kind={s.type}>{s.type.replace("_", " ")}</span>
                          ))}
                        </span>
                      </td>
                      <td><SourceBadge source={a.source} /></td>
                      <td>
                        <Link to={`/accounts/${a.id}?client_id=${encodeURIComponent(clientId)}`}>
                          <button className="btn btn-icon" data-variant="ghost">
                            <Icon name="chevron" size={13} />
                          </button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Floating selection bar */}
          {selectedIds.length > 0 && (
            <div className="selection-bar">
              <span>{selectedIds.length} selected</span>
              <Btn variant="" size="sm" icon="zap">Add to sequence</Btn>
              <Btn variant="" size="sm" icon="users">Run Buyer Intel</Btn>
              <Btn variant="" size="sm" icon="download" onClick={() => downloadCsv(filtered.filter((a) => selectedIds.includes(a.id)))}>Export</Btn>
              <Btn variant="" size="sm" icon="ban" onClick={() => openRemoveModal(filtered.filter((a) => selectedIds.includes(a.id)))}>Remove</Btn>
              <Btn variant="" size="sm" icon="x" onClick={() => setSelectedIds([])}>Clear</Btn>
            </div>
          )}
        </div>
      </div>

      <RemoveAccountModal
        open={removeModalOpen}
        accountCount={targetAccounts.length}
        accountLabel={targetAccounts[0]?.company_name ?? "account"}
        loading={removeAccount.isPending}
        onClose={() => setRemoveModalOpen(false)}
        onConfirm={handleRemove}
      />
    </>
  );
}
