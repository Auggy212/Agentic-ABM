import { useMemo, useState } from "react";
import { useApproveAccount, useRemoveAccount } from "./hooks";
import type {
  AccountApproval,
  CP2ReviewState,
  InferredClaimReview,
} from "./types";

interface Props {
  clientId: string;
  state: CP2ReviewState;
}

interface AccountSummary {
  account: AccountApproval;
  totalClaims: number;
  pendingClaims: number;
  hasIntelReport: boolean;
}

function summarise(state: CP2ReviewState): AccountSummary[] {
  const claimsByAccount = new Map<string, InferredClaimReview[]>();
  for (const claim of state.inferred_claims_review) {
    const list = claimsByAccount.get(claim.account_domain) ?? [];
    list.push(claim);
    claimsByAccount.set(claim.account_domain, list);
  }
  return state.account_approvals.map((account) => {
    const claims = claimsByAccount.get(account.account_domain) ?? [];
    return {
      account,
      totalClaims: claims.length,
      pendingClaims: claims.filter((c) => c.review_decision === "PENDING").length,
      hasIntelReport: account.intel_report_approved !== null,
    };
  });
}

function AccountRow({ clientId, summary }: { clientId: string; summary: AccountSummary }) {
  const approveAccount = useApproveAccount(clientId);
  const removeAccount = useRemoveAccount(clientId);
  const [showRemove, setShowRemove] = useState(false);
  const [reason, setReason] = useState("");

  const { account, totalClaims, pendingClaims, hasIntelReport } = summary;
  const blockedReason =
    pendingClaims > 0
      ? `Cannot approve until all claims reviewed (${pendingClaims} pending)`
      : null;

  const decisionTone: Record<string, string> = {
    PENDING: "var(--text-3)",
    APPROVED: "#15803d",
    NEEDS_REVISION: "#b45309",
    REMOVED_FROM_PIPELINE: "#b91c1c",
  };

  return (
    <div
      data-testid={`account-row-${account.account_domain}`}
      data-decision={account.account_decision}
      className="card card-pad"
      style={{ display: "grid", gap: 10 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{account.account_domain}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            {totalClaims} inferred claims · {pendingClaims} pending
            {hasIntelReport && " · Tier 1 (intel report)"}
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: decisionTone[account.account_decision] ?? "inherit",
          }}
        >
          {account.account_decision.replace(/_/g, " ")}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          data-testid={`approve-account-${account.account_domain}`}
          disabled={Boolean(blockedReason) || approveAccount.isPending}
          title={blockedReason ?? undefined}
          onClick={() => approveAccount.mutate({ domain: account.account_domain })}
        >
          Approve account
        </button>
        <button
          type="button"
          className="btn-ghost"
          data-testid={`remove-account-${account.account_domain}`}
          onClick={() => setShowRemove((v) => !v)}
        >
          Remove
        </button>
        {blockedReason && (
          <span
            data-testid={`account-block-${account.account_domain}`}
            style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700 }}
          >
            {blockedReason}
          </span>
        )}
      </div>

      {showRemove && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for removal (required)"
            style={{ flex: 1, padding: 6, border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={!reason.trim()}
            onClick={() =>
              removeAccount.mutate(
                { domain: account.account_domain, reason: reason.trim() },
                { onSuccess: () => setShowRemove(false) },
              )
            }
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

export default function BulkView({ clientId, state }: Props) {
  const summaries = useMemo(() => summarise(state), [state]);
  const eligibleApprovals = summaries.filter((s) => s.pendingClaims === 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="card card-pad" style={{ display: "grid", gap: 8 }}>
        <div className="section-eyebrow">Bulk view</div>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
          Bulk view operates on accounts only. Inferred claims always require deliberate
          per-claim review — switch to <strong>Per-Claim Review</strong> to approve, correct,
          or remove individual claims. Account approval unlocks once every inferred claim for
          that account has been decided.
        </p>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>
          {eligibleApprovals.length} of {summaries.length} accounts eligible for bulk approval.
        </div>
      </div>

      {summaries.map((summary) => (
        <AccountRow key={summary.account.account_domain} clientId={clientId} summary={summary} />
      ))}
    </div>
  );
}
