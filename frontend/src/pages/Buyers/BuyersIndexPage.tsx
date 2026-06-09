import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useBuyersByClient } from "@/pages/Accounts/buyers/hooks";
import { getActiveClientId } from "@/lib/session";
import type { CommitteeRole } from "@/pages/Accounts/buyers/types";

type RoleFilter = "ALL" | CommitteeRole;

const ROLE_OPTIONS: { value: CommitteeRole; label: string; dot: string; bg: string; fg: string }[] = [
  { value: "DECISION_MAKER", label: "Decision Maker", dot: "#3b82f6", bg: "#eff6ff", fg: "#1d4ed8" },
  { value: "CHAMPION",       label: "Champion",       dot: "#16a05c", bg: "#e8fbf1", fg: "#0d6e3e" },
  { value: "BLOCKER",        label: "Blocker",        dot: "#e0493c", bg: "#fef0ef", fg: "#9b2519" },
  { value: "INFLUENCER",     label: "Influencer",     dot: "#d4940a", bg: "#fef8e7", fg: "#8a5f07" },
];

function logoColor(name: string): string {
  const colors = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#3b82f6"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

export default function BuyersIndexPage() {
  const { data, isLoading, isError } = useBuyersByClient(getActiveClientId());
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [search, setSearch]         = useState("");

  const allContacts = useMemo(() => {
    if (!data) return [];
    return Object.values(data.accounts).flat();
  }, [data]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of allContacts) counts[c.committee_role] = (counts[c.committee_role] ?? 0) + 1;
    return counts;
  }, [allContacts]);

  const filtered = useMemo(() => {
    return allContacts.filter((c) => {
      const matchRole   = roleFilter === "ALL" || c.committee_role === roleFilter;
      const s = search.trim().toLowerCase();
      const matchSearch = !s || (c.full_name ?? "").toLowerCase().includes(s);
      return matchRole && matchSearch;
    });
  }, [allContacts, roleFilter, search]);

  const accountCount = data ? Object.keys(data.accounts).length : 0;
  const jobChanges   = allContacts.filter((c) => c.job_change_signal).length;

  if (isLoading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading buyer intel…" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", minWidth: 0 }}>
      {/* ── Page Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Buyer Intel</div>
          <h1 className="ph-title">Map the Buying Committee</h1>
          <p className="ph-subtitle">
            Know who can move a deal forward at every target account — decision makers, champions, blockers, and influencers — enriched with messaging hooks.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Accounts</div>
            <div className="ph-kpi-num">{accountCount}</div>
          </div>
          <div className="ph-kpi" data-tone="green">
            <div className="ph-kpi-label">Contacts</div>
            <div className="ph-kpi-num">{allContacts.length}</div>
          </div>
          {jobChanges > 0 && (
            <div className="ph-kpi" data-tone="amber">
              <div className="ph-kpi-label">Job Changes</div>
              <div className="ph-kpi-num">{jobChanges}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="ph-actions">
        <div className="ph-search">
          <span className="ph-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Role quick-filter chips */}
        <div style={{ display: "flex", gap: 6 }}>
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setRoleFilter((prev) => prev === r.value ? "ALL" : r.value)}
              style={{
                padding: "5px 12px", borderRadius: 999,
                border: `1.5px solid ${roleFilter === r.value ? r.dot : "var(--border)"}`,
                background: roleFilter === r.value ? r.bg : "var(--surface)",
                color: roleFilter === r.value ? r.fg : "var(--text-2)",
                fontWeight: 600, fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.15s",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.dot }} />
              {r.label}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: roleFilter === r.value ? r.dot + "33" : "var(--ink-100)", padding: "0 5px", borderRadius: 4, color: roleFilter === r.value ? r.fg : "var(--text-3)" }}>
                {roleCounts[r.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-2)" }}>
          <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> contacts
        </span>
      </div>

      {/* ── Content ── */}
      {isError || !data || allContacts.length === 0 ? (
        <div style={{ padding: 24 }}>
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">{isError ? "Failed to load contacts" : "No contacts yet"}</div>
            <div className="empty-sub">
              {isError
                ? "The buyer intel request failed. Try refreshing."
                : "Run the Buyer Intel agent from the Pipeline page to discover and enrich buying committee contacts."}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ width: "100%", background: "var(--surface)", borderTop: "1px solid var(--border)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", fontSize: 13.5 }}>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "26%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                {["Contact", "Title", "Company", "Committee Role", "Email Status"].map((h) => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-mute)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", background: "var(--surface-2)", position: "sticky", top: 0, zIndex: 2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "48px 24px", textAlign: "center" }}>
                    <div className="empty-icon" style={{ margin: "0 auto 12px" }}>🔍</div>
                    <div className="empty-title">No contacts match</div>
                    <div className="empty-sub">Try clearing the role filter or search term.</div>
                  </td>
                </tr>
              ) : filtered.map((c) => {
                const roleOpt = ROLE_OPTIONS.find((r) => r.value === c.committee_role);
                const name = c.full_name ?? c.contact_id.slice(0, 8);
                return (
                  <tr key={c.contact_id} style={{ borderBottom: "1px solid rgba(228,230,242,0.6)", transition: "background 0.1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ink-50)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "13px 20px", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: logoColor(name), color: "white", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>{name[0]}</div>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                      </div>
                    </td>
                    <td style={{ padding: "13px 20px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.current_title ?? <span style={{ color: "var(--text-mute)" }}>—</span>}
                    </td>
                    <td style={{ padding: "13px 20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span className="cell-domain">{c.account_domain ?? "—"}</span>
                    </td>
                    <td style={{ padding: "13px 20px" }}>
                      {roleOpt ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, background: roleOpt.bg, color: roleOpt.fg, fontSize: 11.5, fontWeight: 700, border: `1px solid ${roleOpt.dot}44` }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: roleOpt.dot }} />
                          {roleOpt.label}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-mute)" }}>{c.committee_role}</span>
                      )}
                    </td>
                    <td style={{ padding: "13px 20px" }}>
                      <span className="chip">{c.email_status ?? "Unknown"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
