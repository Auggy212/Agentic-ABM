import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Tooltip from "@/components/ui/Tooltip";
import { useGlobalVerificationStats } from "@/pages/Accounts/verification/hooks";
import type { EmailFinalStatus, SourceBreakdown, VerificationResult } from "@/pages/Accounts/verification/types";
import {
  pct,
  qualityColors,
  sourceLabel,
  statusColors,
  Pill,
} from "@/pages/Accounts/verification/verificationUi";

const STATUSES: ("ALL" | EmailFinalStatus)[] = ["ALL", "VALID", "CATCH_ALL", "RISKY", "INVALID", "NOT_FOUND"];
const SOURCES = ["ALL", "apollo", "hunter", "clay", "linkedin_manual"] as const;

function AggregateCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card card-pad">
      <div className="section-eyebrow">{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 2, minWidth: 120 }}>
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          style={{
            height: 8,
            borderRadius: 3,
            background: index < Math.round(value * 10) ? "#15803d" : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}

function SourceBreakdownCard({
  source,
  breakdown,
  lowest,
}: {
  source: string;
  breakdown: SourceBreakdown;
  lowest: boolean;
}) {
  return (
    <div
      data-testid={`source-breakdown-${source}`}
      style={{
        border: `2px solid ${lowest ? "#f59e0b" : "var(--border)"}`,
        background: lowest ? "#fffbeb" : "var(--surface-1)",
        borderRadius: 8,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>{sourceLabel(source)}</div>
        {lowest && (
          <Tooltip content="Lowest-pass source - see diagnosis below">
            <span style={{ color: "#b45309", fontSize: 12, fontWeight: 800 }}>lowest</span>
          </Tooltip>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
        <span>
          {breakdown.valid}/{breakdown.total} valid ({pct(breakdown.pass_rate)})
        </span>
        <Bar value={breakdown.pass_rate} />
      </div>
    </div>
  );
}

function sourceForRow(row: VerificationResult) {
  return row.source ?? "apollo";
}

export default function VerificationDashboard() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id");
  const query = useGlobalVerificationStats(clientId);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("ALL");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("ALL");
  const [minScore, setMinScore] = useState(0);

  const packageData = query.data;
  const sources = useMemo(() => {
    if (!packageData) return [];
    const entries: [string, SourceBreakdown][] = [
      ["apollo", packageData.per_source_breakdown.apollo],
      ["hunter", packageData.per_source_breakdown.hunter],
    ];
    if (packageData.per_source_breakdown.clay) {
      entries.push(["clay", packageData.per_source_breakdown.clay]);
    }
    if (packageData.per_source_breakdown.linkedin_manual) {
      entries.push(["linkedin_manual", packageData.per_source_breakdown.linkedin_manual]);
    }
    return entries;
  }, [packageData]);

  const lowestSource = sources.reduce<readonly [string, SourceBreakdown] | null>((lowest, current) => {
    if (!lowest) return current;
    return current[1].pass_rate < lowest[1].pass_rate ? current : lowest;
  }, null);

  const filtered = useMemo(() => {
    if (!packageData) return [];
    return packageData.verifications.filter((row) => {
      const statusOk = status === "ALL" || row.email_verification.final_status === status;
      const sourceOk = source === "ALL" || sourceForRow(row) === source;
      const scoreOk = row.overall_data_quality_score >= minScore;
      return statusOk && sourceOk && scoreOk;
    });
  }, [packageData, status, source, minScore]);

  if (query.isLoading) {
    return (
      <div className="page-body" style={{ display: "flex", justifyContent: "center", minHeight: 300, alignItems: "center" }}>
        <LoadingSpinner size="lg" label="Loading verification dashboard" />
      </div>
    );
  }

  if (query.isError || !packageData) {
    return (
      <div className="page-body">
        <div className="card card-pad" style={{ color: "var(--text-3)", textAlign: "center" }}>
          Verification data is not available yet.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>
          Verification
        </h1>
        <div className="page-head-meta" style={{ marginLeft: 12 }}>
          client {packageData.client_id.slice(0, 8)}...
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 12 }}>
          <AggregateCard label="Total contacts" value={packageData.aggregate.total_contacts} />
          <AggregateCard label="Deliverability rate" value={pct(packageData.aggregate.deliverability_rate)} />
          <AggregateCard label="LinkedIn reachable" value={pct(packageData.aggregate.linkedin_reachable_rate)} />
          <AggregateCard label="Website reachable" value={pct(packageData.aggregate.website_reachable_rate)} />
        </div>

        <div className="card card-pad" style={{ display: "grid", gap: 14 }}>
          <div>
            <div className="section-eyebrow">Per-source pass-rate breakdown</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-3)" }}>
              The source view is the diagnosis surface for deliverability misses.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {sources.map(([name, breakdown]) => (
              <SourceBreakdownCard
                key={name}
                source={name}
                breakdown={breakdown}
                lowest={lowestSource?.[0] === name}
              />
            ))}
          </div>
        </div>

        {!packageData.meets_deliverability_target && packageData.target_miss_diagnosis && (
          <div
            data-testid="diagnosis-banner"
            style={{
              border: "1px solid #fde68a",
              background: "#fffbeb",
              color: "#92400e",
              borderRadius: 8,
              padding: 16,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.5,
            }}
          >
            {packageData.target_miss_diagnosis}
          </div>
        )}

        <div className="card card-pad" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div className="section-eyebrow">Contact verification table</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                Filter by final status, source, and minimum data quality score.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                {STATUSES.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select value={source} onChange={(event) => setSource(event.target.value as typeof source)}>
                {SOURCES.map((option) => <option key={option}>{option}</option>)}
              </select>
              <label style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                Min score
                <input
                  aria-label="Minimum data quality score"
                  type="range"
                  min={0}
                  max={100}
                  value={minScore}
                  onChange={(event) => setMinScore(Number(event.target.value))}
                />
                {minScore}
              </label>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-3)" }}>
                <th style={{ padding: "8px" }}>Contact</th>
                <th style={{ padding: "8px" }}>Domain</th>
                <th style={{ padding: "8px" }}>Source</th>
                <th style={{ padding: "8px" }}>Final status</th>
                <th style={{ padding: "8px" }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const colors = qualityColors(row.overall_data_quality_score);
                return (
                  <tr key={row.contact_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px", fontWeight: 700 }}>{row.display_name ?? row.contact_id.slice(0, 8)}</td>
                    <td style={{ padding: "8px", color: "var(--text-2)" }}>{row.account_domain}</td>
                    <td style={{ padding: "8px" }}>{sourceLabel(sourceForRow(row))}</td>
                    <td style={{ padding: "8px" }}>
                      <Pill colors={statusColors[row.email_verification.final_status]}>
                        {row.email_verification.final_status}
                      </Pill>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <Pill colors={colors}>{row.overall_data_quality_score}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
