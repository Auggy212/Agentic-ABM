import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Btn from "@/components/ui/Btn";
import ContactVerificationCard from "./ContactVerificationCard";
import { useVerificationByAccount, useRecheckContact } from "./hooks";
import { useBuyersByAccount } from "../buyers/hooks";
import type { VerificationResult } from "./types";
import { formatRelativeTime, pct, qualityColors } from "./verificationUi";

function averageScore(verifications: VerificationResult[]) {
  if (!verifications.length) return 0;
  return Math.round(
    verifications.reduce((sum, verification) => sum + verification.overall_data_quality_score, 0) /
      verifications.length,
  );
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card card-pad" style={{ minHeight: 86 }}>
      <div className="section-eyebrow">{label}</div>
      <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800 }}>{children}</div>
    </div>
  );
}

export default function VerificationTab({
  domain,
  clientId,
}: {
  domain: string;
  clientId: string | null;
}) {
  const verificationQuery = useVerificationByAccount(domain, clientId);
  const buyersQuery = useBuyersByAccount(domain);
  const recheck = useRecheckContact();

  if (verificationQuery.isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240 }}>
        <LoadingSpinner size="lg" label="Loading verification results" />
      </div>
    );
  }

  if (verificationQuery.isError || !verificationQuery.data || verificationQuery.data.verifications.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "var(--text-3)",
          fontSize: 13,
          background: "var(--surface-2)",
          borderRadius: 10,
          border: "1px dashed var(--border)",
        }}
      >
        Verification has not run for this account yet.
      </div>
    );
  }

  const verifications = verificationQuery.data.verifications;
  const contacts = buyersQuery.data?.contacts ?? [];
  const contactById = new Map(contacts.map((contact) => [contact.contact_id, contact]));
  const score = averageScore(verifications);
  const scoreColor = qualityColors(score);
  const lastVerified = verifications
    .map((verification) => verification.verified_at)
    .sort()
    .slice(-1)[0];
  const valid = verifications.filter((v) => v.email_verification.final_status === "VALID").length;
  const catchAll = verifications.filter((v) => v.email_verification.final_status === "CATCH_ALL").length;
  const invalid = verifications.filter((v) => v.email_verification.final_status === "INVALID").length;
  const linkedinReachable = verifications.filter((v) => v.linkedin_check.reachable).length;
  const websiteReachable = verifications.every((v) => v.website_check.reachable);
  const mismatchRows = verifications.filter(
    (v) => v.title_reconciliation.apollo_title !== v.title_reconciliation.resolved_title || !v.title_reconciliation.mismatch_resolved,
  );
  const mismatchCount = mismatchRows.length;
  const resolvedMismatches = mismatchRows.filter((v) => v.title_reconciliation.mismatch_resolved).length;
  const pendingMismatches = mismatchRows.filter((v) => !v.title_reconciliation.mismatch_resolved).length;

  async function reverifyAll() {
    for (const verification of verifications) {
      await recheck.mutateAsync(verification.contact_id);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        className="card card-pad"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
          borderColor: scoreColor.border,
          background: scoreColor.bg,
        }}
      >
        <div>
          <div className="section-eyebrow">Verification health</div>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, color: scoreColor.fg }}>
            Data Quality Score: {score}/100
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-3)" }}>
            Last verified: {formatRelativeTime(lastVerified)}
          </div>
        </div>
        <Btn variant="accent" size="sm" icon="activity" loading={recheck.isPending} onClick={reverifyAll}>
          Re-verify
        </Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 12 }}>
        <SummaryCard label="Email">
          {valid} valid - {catchAll} catch-all - {invalid} invalid
        </SummaryCard>
        <SummaryCard label="LinkedIn">
          {linkedinReachable}/{verifications.length} reachable
        </SummaryCard>
        <SummaryCard label="Website">{websiteReachable ? "reachable" : "attention needed"}</SummaryCard>
        <SummaryCard label="Title reconciliation">
          {resolvedMismatches} of {mismatchCount} mismatches resolved
          <div style={{ marginTop: 4, color: "#b45309", fontSize: 12, fontWeight: 700 }}>
            {pendingMismatches} pending PhantomBuster
          </div>
        </SummaryCard>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="section-eyebrow">Per-contact results</div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>
          Account deliverability: {pct(valid / verifications.length)}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {verifications.map((verification) => (
          <ContactVerificationCard
            key={verification.contact_id}
            verification={verification}
            contact={contactById.get(verification.contact_id)}
          />
        ))}
      </div>
    </div>
  );
}
