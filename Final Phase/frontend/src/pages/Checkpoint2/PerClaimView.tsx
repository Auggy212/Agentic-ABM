import { useMemo, useState } from "react";
import ClaimDecisionButtons from "./ClaimDecisionButtons";
import {
  SOURCE_TYPE_LABELS,
  type ClaimSourceType,
  type CP2ReviewState,
  type InferredClaimReview,
  type ReviewDecision,
} from "./types";

interface Props {
  clientId: string;
  state: CP2ReviewState;
}

const SOURCE_ORDER: ClaimSourceType[] = [
  "BUYER_PAIN_POINT",
  "INTEL_REPORT_PRIORITY",
  "INTEL_REPORT_COMPETITOR",
  "INTEL_REPORT_PAIN",
  "INTEL_REPORT_OTHER",
];

const DECISIONS: ("ALL" | ReviewDecision)[] = [
  "ALL",
  "PENDING",
  "APPROVED",
  "CORRECTED",
  "REMOVED",
];

function ClaimCard({
  clientId,
  claim,
}: {
  clientId: string;
  claim: InferredClaimReview;
}) {
  const isCorrected = claim.review_decision === "CORRECTED" && claim.corrected_text;
  return (
    <div
      data-testid={`claim-card-${claim.claim_id}`}
      data-decision={claim.review_decision}
      className="card card-pad"
      style={{ display: "grid", gap: 10 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700 }}>
          {claim.account_domain}
          {claim.contact_id && ` · contact ${claim.contact_id.slice(0, 8)}…`}
        </div>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            background: "var(--surface-2)",
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          [INFERRED]
        </span>
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          textDecoration: claim.review_decision === "REMOVED" ? "line-through" : "none",
          color: claim.review_decision === "REMOVED" ? "var(--text-3)" : "inherit",
        }}
      >
        {claim.claim_text}
      </div>
      {isCorrected && (
        <div
          style={{
            fontSize: 13,
            padding: 10,
            borderLeft: "3px solid #f59e0b",
            background: "#fffbeb",
            color: "#92400e",
          }}
        >
          <strong>Corrected:</strong> {claim.corrected_text}
        </div>
      )}
      <div style={{ fontSize: 13, color: "var(--text-3)" }}>
        Reasoning: {claim.reasoning}
      </div>
      <ClaimDecisionButtons clientId={clientId} claim={claim} />
    </div>
  );
}

export default function PerClaimView({ clientId, state }: Props) {
  const [decisionFilter, setDecisionFilter] = useState<(typeof DECISIONS)[number]>("ALL");
  const [accountQuery, setAccountQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | ClaimSourceType>("ALL");

  const filtered = useMemo(() => {
    return state.inferred_claims_review.filter((claim) => {
      const decisionOk = decisionFilter === "ALL" || claim.review_decision === decisionFilter;
      const sourceOk = sourceFilter === "ALL" || claim.source_type === sourceFilter;
      const accountOk =
        !accountQuery ||
        claim.account_domain.toLowerCase().includes(accountQuery.toLowerCase());
      return decisionOk && sourceOk && accountOk;
    });
  }, [state.inferred_claims_review, decisionFilter, sourceFilter, accountQuery]);

  const groups = useMemo(() => {
    const buckets = new Map<ClaimSourceType, InferredClaimReview[]>();
    for (const source of SOURCE_ORDER) {
      buckets.set(source, []);
    }
    for (const claim of filtered) {
      const list = buckets.get(claim.source_type);
      if (list) list.push(claim);
    }
    return SOURCE_ORDER.map((source) => ({
      source,
      claims: buckets.get(source) ?? [],
    })).filter((group) => group.claims.length > 0);
  }, [filtered]);

  const counts = useMemo(() => {
    const total = new Map<ClaimSourceType, number>();
    const reviewed = new Map<ClaimSourceType, number>();
    for (const claim of state.inferred_claims_review) {
      total.set(claim.source_type, (total.get(claim.source_type) ?? 0) + 1);
      if (claim.review_decision !== "PENDING") {
        reviewed.set(claim.source_type, (reviewed.get(claim.source_type) ?? 0) + 1);
      }
    }
    return { total, reviewed };
  }, [state.inferred_claims_review]);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="card card-pad" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
          Source
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
            data-testid="filter-source"
          >
            <option value="ALL">All sources</option>
            {SOURCE_ORDER.map((source) => (
              <option key={source} value={source}>
                {SOURCE_TYPE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
          Decision
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value as typeof decisionFilter)}
            data-testid="filter-decision"
          >
            {DECISIONS.map((decision) => (
              <option key={decision} value={decision}>
                {decision}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 200 }}>
          Account
          <input
            value={accountQuery}
            onChange={(e) => setAccountQuery(e.target.value)}
            placeholder="filter by domain"
            data-testid="filter-account"
            style={{ flex: 1, padding: 6, border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
          No claims match the current filters.
        </div>
      ) : (
        groups.map((group) => {
          const total = counts.total.get(group.source) ?? 0;
          const reviewed = counts.reviewed.get(group.source) ?? 0;
          return (
            <section key={group.source} data-testid={`group-${group.source}`} style={{ display: "grid", gap: 10 }}>
              <div className="section-eyebrow" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>⬢ {SOURCE_TYPE_LABELS[group.source]}</span>
                <span>
                  {total} claims · {reviewed} reviewed
                </span>
              </div>
              {group.claims.map((claim) => (
                <ClaimCard key={claim.claim_id} clientId={clientId} claim={claim} />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
