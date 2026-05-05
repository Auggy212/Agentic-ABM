import { Link, useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Btn from "@/components/ui/Btn";
import { useDiscoverSignals, useSignalsByClient } from "./Accounts/signals/hooks";
import type { SignalReport } from "./Accounts/signals/types";

const DEFAULT_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

const STAGE_LABEL: Record<string, string> = {
  UNAWARE: "Unaware",
  PROBLEM_AWARE: "Problem aware",
  SOLUTION_AWARE: "Solution aware",
  EVALUATING: "Evaluating",
  READY_TO_BUY: "Ready to buy",
};

function stageTone(stage: string) {
  if (stage === "READY_TO_BUY") return { bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" };
  if (stage === "EVALUATING") return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
  if (stage === "SOLUTION_AWARE") return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
  return { bg: "var(--surface-2)", fg: "var(--text-2)", border: "var(--border)" };
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card card-pad" style={{ borderRadius: 8 }}>
      <div className="section-eyebrow">{label}</div>
      <div style={{ marginTop: 8, fontSize: 26, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function SignalRow({ report }: { report: SignalReport }) {
  const tone = stageTone(report.buying_stage);
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ padding: "10px 12px", fontWeight: 800 }}>
        <Link to={`/accounts/${encodeURIComponent(report.account_domain)}`}>{report.account_domain}</Link>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <span className={`tier-badge tier-${report.tier.replace("IER_", "")}`}>{report.tier.replace("_", " ")}</span>
      </td>
      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)" }}>{report.signal_score.total_score}</td>
      <td style={{ padding: "10px 12px" }}>
        <span
          style={{
            border: `1px solid ${tone.border}`,
            background: tone.bg,
            color: tone.fg,
            borderRadius: 999,
            padding: "3px 8px",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {STAGE_LABEL[report.buying_stage] ?? report.buying_stage}
        </span>
      </td>
      <td style={{ padding: "10px 12px", color: "var(--text-2)" }}>
        {report.signals.slice(0, 2).map((signal) => signal.description).join(" | ") || "No active signals"}
      </td>
      <td style={{ padding: "10px 12px", textAlign: "right" }}>
        <Link className="btn btn-sm" to={`/accounts/${encodeURIComponent(report.account_domain)}?tab=signals`}>
          Open
        </Link>
      </td>
    </tr>
  );
}

export function SignalsPage() {
  const [params] = useSearchParams();
  const clientId = params.get("client_id") || DEFAULT_CLIENT_ID;
  const query = useSignalsByClient(clientId);
  const discover = useDiscoverSignals();
  const reports = Object.values(query.data ?? {}).sort(
    (a, b) => b.signal_score.total_score - a.signal_score.total_score,
  );

  const highIntent = reports.filter((report) => report.signal_score.high_count > 0).length;
  const ready = reports.filter((report) => report.buying_stage === "READY_TO_BUY").length;
  const tier1WithIntel = reports.filter((report) => report.tier === "TIER_1" && report.intel_report).length;

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>
          Signals
        </h1>
        <div className="page-head-meta">client {clientId.slice(0, 8)}</div>
        <div className="page-head-actions">
          <Btn
            variant="primary"
            icon="activity"
            loading={discover.isPending}
            onClick={() => discover.mutate(clientId)}
          >
            Run signal discovery
          </Btn>
        </div>
      </div>

      <div className="page-body" style={{ display: "grid", gap: 18 }}>
        {query.isLoading ? (
          <div style={{ display: "grid", placeItems: "center", minHeight: 320 }}>
            <LoadingSpinner size="lg" label="Loading signals" />
          </div>
        ) : query.isError ? (
          <div className="card card-pad" style={{ borderRadius: 8, color: "var(--bad-700)" }}>
            Signal intelligence is not available yet.
          </div>
        ) : (
          <>
            <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 0 }}>
              <Kpi label="Accounts with signals" value={reports.length} />
              <Kpi label="High-intent accounts" value={highIntent} />
              <Kpi label="Ready to buy" value={ready} />
              <Kpi label="Tier 1 intel reports" value={tier1WithIntel} />
            </div>

            <div className="card" style={{ borderRadius: 8, overflow: "hidden" }}>
              <div className="grid-toolbar">
                <div>
                  <div className="section-eyebrow">Signal intelligence</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-3)" }}>
                    Prioritized buying signals, stage, and account intel readiness.
                  </div>
                </div>
              </div>
              {reports.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>
                  No signal reports yet. Run signal discovery from this page or Pipeline.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-2)", color: "var(--text-3)", textAlign: "left" }}>
                        <th style={{ padding: "9px 12px" }}>Account</th>
                        <th style={{ padding: "9px 12px" }}>Tier</th>
                        <th style={{ padding: "9px 12px" }}>Score</th>
                        <th style={{ padding: "9px 12px" }}>Stage</th>
                        <th style={{ padding: "9px 12px" }}>Top signals</th>
                        <th style={{ padding: "9px 12px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <SignalRow key={report.account_domain} report={report} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
