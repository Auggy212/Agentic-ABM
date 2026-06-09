import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useGlobalVerificationStats } from "@/pages/Accounts/verification/hooks";
import type { EmailFinalStatus } from "@/pages/Accounts/verification/types";
import { pct, qualityColors, sourceLabel, statusColors, Pill } from "@/pages/Accounts/verification/verificationUi";

const STATUSES: ("ALL" | EmailFinalStatus)[] = ["ALL", "VALID", "CATCH_ALL", "RISKY", "INVALID", "NOT_FOUND"];
const SOURCES = ["ALL", "apollo", "hunter", "clay", "linkedin_manual"] as const;

const STATUS_ICONS: Record<string, string> = {
  VALID: "✓", CATCH_ALL: "~", RISKY: "!", INVALID: "✕", NOT_FOUND: "?", ALL: "·",
};

export default function VerificationDashboard() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id");
  const query = useGlobalVerificationStats(clientId);
  const [status, setStatus]   = useState<(typeof STATUSES)[number]>("ALL");
  const [source, setSource]   = useState<(typeof SOURCES)[number]>("ALL");

  const packageData = query.data;

  const filtered = useMemo(() => {
    if (!packageData?.verifications) return [];
    return packageData.verifications.filter((row) => {
      const statusOk = status === "ALL" || row.email_verification.final_status === status;
      const sourceOk = source === "ALL" || (row.source ?? "apollo") === source;
      return statusOk && sourceOk;
    });
  }, [packageData, status, source]);

  const lastRunLabel = packageData
    ? new Date(packageData.verified_at ?? "").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";

  if (query.isLoading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading verification dashboard" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", minWidth: 0 }}>
      {/* ── Page Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Verifier</div>
          <h1 className="ph-title">Validate Contacts Before Outreach</h1>
          <p className="ph-subtitle">
            Review email deliverability, LinkedIn health, title confidence, and data quality flags — all in one focused verification workspace.
          </p>
        </div>
        <div className="ph-kpis">
          {packageData?.aggregate ? (
            <>
              <div className="ph-kpi">
                <div className="ph-kpi-label">Contacts</div>
                <div className="ph-kpi-num">{packageData.aggregate.total_contacts}</div>
              </div>
              <div className="ph-kpi" data-tone="green">
                <div className="ph-kpi-label">Deliverable</div>
                <div className="ph-kpi-num">{pct(packageData.aggregate.deliverability_rate)}</div>
              </div>
              <div className="ph-kpi" data-tone="amber">
                <div className="ph-kpi-label">LinkedIn</div>
                <div className="ph-kpi-num">{pct(packageData.aggregate.linkedin_reachable_rate)}</div>
              </div>
              <div className="ph-kpi">
                <div className="ph-kpi-label">Last Run</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", lineHeight: 1, marginTop: 6, letterSpacing: "-0.02em" }}>{lastRunLabel}</div>
              </div>
            </>
          ) : (
            <div className="ph-kpi">
              <div className="ph-kpi-label">Last Run</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-mute)", lineHeight: 1, marginTop: 6 }}>Not run yet</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {query.isError || !packageData?.verifications ? (
        <div style={{ padding: 24 }}>
          <div className="empty-state">
            <div className="empty-icon">{query.isError ? "⚠" : "✓"}</div>
            <div className="empty-title">
              {query.isError ? "Unable to load verification status" : "No verification data yet"}
            </div>
            <div className="empty-sub">
              {query.isError
                ? "The verifier status request did not complete. Try again in a moment."
                : "Run the Verifier agent from the Pipeline page to validate contact emails and LinkedIn profiles."}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="ph-actions">
            <select className="ph-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_ICONS[s]} {s === "ALL" ? "All statuses" : s}
                </option>
              ))}
            </select>
            <select className="ph-select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s === "ALL" ? "All sources" : sourceLabel(s)}</option>
              ))}
            </select>
            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-2)" }}>
              <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> contacts
            </span>
          </div>

          {/* Table */}
          <div style={{ width: "100%", background: "var(--surface)", borderTop: "1px solid var(--border)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", fontSize: 13.5 }}>
              <colgroup>
                <col style={{ width: "24%" }} />
                <col style={{ width: "28%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  {["Contact", "Domain", "Source", "Email Status", "Quality"].map((h) => (
                    <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-mute)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", background: "var(--surface-2)", position: "sticky", top: 0, zIndex: 2 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "48px 24px", textAlign: "center" }}>
                      <div className="empty-icon" style={{ margin: "0 auto 12px" }}>🔍</div>
                      <div className="empty-title">No contacts match these filters</div>
                      <div className="empty-sub">Adjust the status or source filter.</div>
                    </td>
                  </tr>
                ) : filtered.map((row) => {
                  const qColors = qualityColors(row.overall_data_quality_score);
                  return (
                    <tr key={row.contact_id} style={{ borderBottom: "1px solid rgba(228,230,242,0.6)", transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ink-50)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "13px 20px", overflow: "hidden" }}>
                        <div style={{ fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {(row as any).display_name || row.contact_id.slice(0, 8)}
                        </div>
                        {(row as any).contact_title && (
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {(row as any).contact_title}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "13px 20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span className="cell-domain">{row.account_domain}</span>
                      </td>
                      <td style={{ padding: "13px 20px" }}>
                        <span className="source-badge">{sourceLabel(row.source ?? "apollo")}</span>
                      </td>
                      <td style={{ padding: "13px 20px" }}>
                        <Pill colors={statusColors[row.email_verification.final_status]}>
                          {row.email_verification.final_status}
                        </Pill>
                      </td>
                      <td style={{ padding: "13px 20px" }}>
                        <Pill colors={qColors}>{row.overall_data_quality_score}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
