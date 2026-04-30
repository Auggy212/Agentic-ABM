import { useState } from "react";
import Tooltip from "@/components/ui/Tooltip";
import type { BuyerProfile } from "../buyers/types";
import EmailEngineDetail from "./EmailEngineDetail";
import type { EmailVerification, VerificationResult } from "./types";
import {
  formatRelativeTime,
  issueColor,
  methodColors,
  Pill,
  qualityColors,
  statusColors,
} from "./verificationUi";

function roleLabel(role: string | undefined) {
  return (role ?? "UNKNOWN").replace(/_/g, " ");
}

function EngineBadge({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        color: "#1d4ed8",
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label} check
    </button>
  );
}

export default function ContactVerificationCard({
  verification,
  contact,
}: {
  verification: VerificationResult;
  contact?: BuyerProfile;
}) {
  const [engineOpen, setEngineOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [httpOpen, setHttpOpen] = useState(false);
  const email = verification.email_verification;
  const quality = qualityColors(verification.overall_data_quality_score);
  const jobConfidence = verification.job_change_verification.confidence;
  const jobGood = jobConfidence >= 0.9;
  const displayName = contact?.full_name ?? verification.display_name ?? verification.contact_id.slice(0, 8);
  const role = contact?.committee_role ?? verification.committee_role;

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{displayName}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
            {roleLabel(role)} | {contact?.current_title ?? verification.title_reconciliation.resolved_title}
          </div>
        </div>
        <Pill colors={quality}>Score {verification.overall_data_quality_score}/100</Pill>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "start", fontSize: 13 }}>
        <div style={{ color: "var(--text-3)", fontWeight: 700 }}>Email</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>{email.email || "not found"}</span>
          <Pill colors={statusColors[email.final_status]}>{email.final_status}</Pill>
          <EngineBadge label="NeverBounce" onClick={() => setEngineOpen(true)} />
          {email.secondary_engine === "ZEROBOUNCE" && (
            <EngineBadge label="ZeroBounce" onClick={() => setEngineOpen(true)} />
          )}
          {email.relookup_attempted && (
            <span style={{ fontSize: 12, color: email.relookup_email ? "#15803d" : "#b45309", fontWeight: 700 }}>
              Re-looked up via Hunter - {email.relookup_email ? "found new email" : "blocked or no match"}
            </span>
          )}
        </div>

        <div style={{ color: "var(--text-3)", fontWeight: 700 }}>LinkedIn</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {verification.linkedin_check.url ? (
            <a href={verification.linkedin_check.url} target="_blank" rel="noreferrer" style={{ color: "var(--acc-600)" }}>
              {verification.linkedin_check.url}
            </a>
          ) : (
            <span style={{ color: "var(--text-3)" }}>No URL</span>
          )}
          <Pill
            colors={
              verification.linkedin_check.reachable
                ? { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" }
                : { fg: "#b91c1c", bg: "#fef2f2", border: "#fecaca" }
            }
          >
            {verification.linkedin_check.reachable ? "reachable" : "unreachable"}
          </Pill>
          <button
            type="button"
            onClick={() => setHttpOpen((v) => !v)}
            style={{ border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", fontSize: 12 }}
          >
            HTTP status
          </button>
          {httpOpen && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {verification.linkedin_check.http_status ?? "none"} | checked {formatRelativeTime(verification.linkedin_check.checked_at)}
            </span>
          )}
        </div>

        <div style={{ color: "var(--text-3)", fontWeight: 700 }}>Title</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(160px, 1fr)", gap: 10 }}>
            <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)" }}>
              <div className="section-eyebrow">Apollo title</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{verification.title_reconciliation.apollo_title}</div>
            </div>
            <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)" }}>
              <div className="section-eyebrow">Resolved title</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{verification.title_reconciliation.resolved_title}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill colors={methodColors[verification.title_reconciliation.resolution_method]}>
              {verification.title_reconciliation.resolution_method}
            </Pill>
            {!verification.title_reconciliation.mismatch_resolved && (
              <Pill colors={{ fg: "#b45309", bg: "#fffbeb", border: "#fde68a" }}>
                PhantomBuster reconciliation deferred to Phase 5
              </Pill>
            )}
          </div>
        </div>

        <div style={{ color: "var(--text-3)", fontWeight: 700 }}>Job change</div>
        <div>
          <Tooltip
            content={
              jobGood
                ? "LinkedIn activity confirmed the job change, so Phase 5 confidence is high."
                : "Apollo tenure is trusted in Phase 3. Phase 5 raises confidence when LinkedIn activity confirms it."
            }
          >
            <span>
              <Pill
                colors={
                  jobGood
                    ? { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" }
                    : { fg: "#b45309", bg: "#fffbeb", border: "#fde68a" }
                }
              >
                {jobConfidence.toFixed(2)} {jobGood ? "LinkedIn confirmed" : "Apollo-only"}
              </Pill>
            </span>
          </Tooltip>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setIssuesOpen((v) => !v)}
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Issues ({verification.issues.length})
        </button>
        {issuesOpen && (
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {verification.issues.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>No issues recorded.</div>
            ) : (
              verification.issues.map((issue) => (
                <div key={`${issue.code}-${issue.message}`} style={{ fontSize: 12, color: "var(--text-2)" }}>
                  <strong style={{ color: issueColor(issue) }}>{issue.severity}</strong> | {issue.message}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <EmailEngineDetail
        open={engineOpen}
        verification={email as EmailVerification}
        onClose={() => setEngineOpen(false)}
      />
    </div>
  );
}
