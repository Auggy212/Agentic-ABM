import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Btn from "@/components/ui/Btn";
import Icon from "@/components/ui/Icon";
import Logo from "@/components/ui/Logo";
import ScoreViz, { scoreBand } from "@/components/ui/ScoreViz";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import RemoveAccountModal from "./RemoveAccountModal";
import { formatDateTime, formatHeadcount, SCORE_DIMENSIONS, TierBadge, SourceBadge } from "./accountUi";
import { useAccount, useRemoveAccount } from "./hooks";

function strength(value: number, max: number): "strong" | "medium" | "weak" {
  const r = value / max;
  if (r >= 0.75) return "strong";
  if (r >= 0.45) return "medium";
  return "weak";
}

const SCORE_HINTS: Record<string, string> = {
  industry: "Vertical SaaS, Revenue Intel match playbook",
  company_size: "Headcount band 200–1,500",
  geography: "NA + EMEA core regions",
  tech_stack: "Salesforce + Outreach detected",
  funding_stage: "Series B, ≤ 18mo since round",
  buying_triggers: "RevOps hire, expansion announcement",
};

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [removeOpen, setRemoveOpen] = useState(false);
  const accountQuery = useAccount(id);
  const removeAccount = useRemoveAccount();

  const account = accountQuery.data;
  const clientId = searchParams.get("client_id");
  const backUrl = clientId ? `/accounts?client_id=${encodeURIComponent(clientId)}` : "/accounts";

  const totalBreakdown = useMemo(() => {
    if (!account) return 0;
    return Object.values(account.score_breakdown).reduce((sum, v) => sum + v, 0);
  }, [account]);

  async function handleRemove(reason: string) {
    if (!account) return;
    await removeAccount.mutateAsync({ id: account.id, reason });
    navigate(backUrl);
  }

  if (accountQuery.isLoading) {
    return (
      <div className="page-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <LoadingSpinner size="lg" label="Loading account detail" />
      </div>
    );
  }

  if (accountQuery.isError || !account) {
    return (
      <>
        <div className="page-head">
          <Link className="btn" data-variant="ghost" to={backUrl}>← Back to review</Link>
        </div>
        <div className="page-body">
          <div className="card card-pad" style={{ borderColor: "var(--bad-200)", background: "var(--bad-50)" }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--bad-900)", margin: 0 }}>Account not available</h1>
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--bad-700)" }}>
              This account may already have been removed from the review list.
            </p>
          </div>
        </div>
      </>
    );
  }

  const band = scoreBand(account.icp_score);

  return (
    <>
      <div className="page-head">
        <Link className="btn" data-variant="ghost" to={backUrl}>← Back to review</Link>
        <div className="page-head-meta" style={{ marginLeft: 12 }}>Account · {account.id.slice(0, 8)}…</div>
        <div className="page-head-actions">
          <Btn variant="ghost" size="sm" icon="zap">Add to sequence</Btn>
          <Btn variant="ghost" size="sm" icon="users">Run Buyer Intel</Btn>
          <Btn variant="ghost" size="sm" icon="ban" onClick={() => setRemoveOpen(true)}>Remove</Btn>
        </div>
      </div>

      <div className="page-body">
        {/* Hero card */}
        <div className="card" style={{ padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <Logo mark={account.company_name.slice(0, 2).toUpperCase()} size={64} />

            <div style={{ flex: "1 1 320px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <TierBadge tier={account.tier} />
                <SourceBadge source={account.source} />
                <span className="chip">{account.funding_stage}</span>
              </div>
              <h1 style={{
                fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1,
                margin: 0, fontWeight: 400, letterSpacing: "-0.02em",
              }}>
                {account.company_name}
              </h1>
              <div style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 6, fontSize: 13 }}>
                {account.domain}
                {account.hq_location ? ` · ${account.hq_location}` : ""}
                {account.headcount !== "not_found" ? ` · ${formatHeadcount(account.headcount)} employees` : ""}
                {account.estimated_arr ? ` · ${account.estimated_arr}` : ""}
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {account.website && (
                  <a href={account.website} target="_blank" rel="noreferrer" className="btn btn-sm" data-variant="ghost">
                    <Icon name="globe" size={12} /> Website
                  </a>
                )}
                {account.linkedin_url && (
                  <a href={account.linkedin_url} target="_blank" rel="noreferrer" className="btn btn-sm" data-variant="ghost">
                    <Icon name="linkedin" size={12} /> LinkedIn
                  </a>
                )}
              </div>
            </div>

            {/* Score widget */}
            <div style={{
              minWidth: 200, padding: 18, background: "var(--surface-2)",
              borderRadius: 14, border: "1px solid var(--border)",
            }}>
              <div className="section-eyebrow">ICP Score</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 52, lineHeight: 1, fontWeight: 400 }}>
                  {account.icp_score}
                </div>
                <div>
                  <ScoreViz score={account.icp_score} band={band} style="ring" />
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                    out of 100 · {totalBreakdown} pts total
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="detail-grid">
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Score breakdown */}
            <div className="card card-pad">
              <div className="section-eyebrow">Why this scored — generated by ICP Scout</div>
              <h2 style={{
                fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400,
                margin: "6px 0 18px", letterSpacing: "-0.01em",
              }}>
                Score breakdown
              </h2>
              {SCORE_DIMENSIONS.map((d) => {
                const v = account.score_breakdown[d.key];
                const w = (v / d.max) * 100;
                return (
                  <div key={d.key} className="bd-row">
                    <div>
                      <div className="bd-label">{d.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                        {SCORE_HINTS[d.key] ?? ""}
                      </div>
                    </div>
                    <div className="bd-bar">
                      <div
                        className="bd-bar-fill"
                        data-strength={strength(v, d.max)}
                        style={{ width: `${w}%` }}
                      />
                    </div>
                    <div className="bd-val">{v}/{d.max}</div>
                  </div>
                );
              })}
            </div>

            {/* Signals timeline */}
            <div className="card card-pad">
              <div className="section-eyebrow">Recent signals · Signal Watcher · last 90 days</div>
              <h2 style={{
                fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400,
                margin: "6px 0 18px", letterSpacing: "-0.01em",
              }}>
                Why now
              </h2>
              {account.recent_signals.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                  No recent signals recorded.
                </div>
              ) : (
                <div className="timeline">
                  {account.recent_signals.map((s, i) => (
                    <div key={i} className="timeline-item" data-kind={s.type.toLowerCase()}>
                      <div className="timeline-meta">
                        {s.type.replace(/_/g, " ")} · {s.date}
                        {s.source_url !== "not_found" && (
                          <> · <a href={s.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--acc-600)" }}>source</a></>
                        )}
                      </div>
                      <div className="timeline-text">{s.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Firmographics */}
            <div className="card card-pad">
              <div className="section-eyebrow">Firmographics</div>
              <dl style={{ margin: "10px 0 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {([
                  ["Industry", account.industry],
                  ["Headcount", formatHeadcount(account.headcount)],
                  ["HQ", account.hq_location],
                  ["Funding", account.funding_stage],
                  ["ARR band", account.estimated_arr],
                  ["Last round", `${account.last_funding_round.round} · ${account.last_funding_round.date}`],
                  ["Enriched", formatDateTime(account.enriched_at)],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k}>
                    <dt style={{
                      fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-3)",
                      textTransform: "uppercase", letterSpacing: "0.08em",
                    }}>{k}</dt>
                    <dd style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 500 }}>{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Tech stack */}
            <div className="card card-pad">
              <div className="section-eyebrow">Tech stack</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {account.technologies_used.length === 0 ? (
                  <span style={{ fontSize: 13, color: "var(--text-3)" }}>No technologies recorded.</span>
                ) : account.technologies_used.map((t) => (
                  <span key={t} className="cell-tech-pill" style={{ padding: "4px 9px", fontSize: 12 }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Recommended play */}
            <div className="card card-pad">
              <div className="section-eyebrow">Recommended play</div>
              <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>
                <strong>Series B Trigger Play</strong> — high match. 5 steps over 10 days targeting RevOps + CRO.
              </div>
              <div style={{ marginTop: 14 }}>
                <Btn variant="accent" size="sm" icon="zap">Assign sequence</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RemoveAccountModal
        open={removeOpen}
        accountCount={1}
        accountLabel={account.company_name}
        loading={removeAccount.isPending}
        onClose={() => setRemoveOpen(false)}
        onConfirm={handleRemove}
      />
    </>
  );
}
