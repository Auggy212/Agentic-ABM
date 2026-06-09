import { useMemo, useState } from "react";
import { useApproveAccount, useRemoveAccount } from "./hooks";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AccountApproval, CP2ReviewState, InferredClaimReview } from "./types";

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

const DECISION_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  PENDING:               { bg: "var(--surface-3)",  fg: "var(--text-3)",     border: "var(--border)" },
  APPROVED:              { bg: "var(--good-50)",    fg: "var(--good-700)",   border: "var(--good-100)" },
  NEEDS_REVISION:        { bg: "#fef3c7",           fg: "#92400e",           border: "#fde68a" },
  REMOVED_FROM_PIPELINE: { bg: "var(--bad-50)",     fg: "var(--bad-700)",    border: "var(--bad-100)" },
};

function logoLetter(domain: string) {
  return domain.charAt(0).toUpperCase();
}
function logoColor(domain: string): string {
  const colors = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#3b82f6"];
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

function AccountRow({ clientId, summary }: { clientId: string; summary: AccountSummary }) {
  const approveAccount = useApproveAccount(clientId);
  const removeAccount  = useRemoveAccount(clientId);
  const [showRemove, setShowRemove] = useState(false);
  const [reason, setReason] = useState("");

  const { account, totalClaims, pendingClaims, hasIntelReport } = summary;
  const blockedReason = pendingClaims > 0
    ? `Review ${pendingClaims} remaining claim${pendingClaims > 1 ? "s" : ""} in the Review Claims tab first`
    : null;

  const ds = DECISION_STYLE[account.account_decision] ?? DECISION_STYLE.PENDING;
  const color = logoColor(account.account_domain);
  const isApproved = account.account_decision === "APPROVED";
  const isRemoved  = account.account_decision === "REMOVED_FROM_PIPELINE";

  return (
    <div
      data-testid={`account-row-${account.account_domain}`}
      data-decision={account.account_decision}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderLeft: `3px solid ${isApproved ? "var(--good-500)" : isRemoved ? "var(--bad-500,#e0493c)" : "var(--border-strong)"}`,
        borderRadius: 12, padding: "14px 16px",
        display: "grid", gap: 12,
        opacity: isRemoved ? 0.55 : 1,
      }}
    >
      {/* Domain header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: color, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 15, flexShrink: 0,
          }}>
            {logoLetter(account.account_domain)}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>
              {account.account_domain}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
              {totalClaims} claims · {pendingClaims} pending
              {hasIntelReport && " · Tier 1"}
            </div>
          </div>
        </div>
        <span style={{
          padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: ds.bg, color: ds.fg, border: `1px solid ${ds.border}`,
          whiteSpace: "nowrap",
        }}>
          {account.account_decision.replace(/_/g, " ")}
        </span>
      </div>

      {/* Action row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid={`approve-account-${account.account_domain}`}
          disabled={Boolean(blockedReason) || approveAccount.isPending}
          title={blockedReason ?? undefined}
          onClick={() => approveAccount.mutate({ domain: account.account_domain })}
          style={{
            fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8,
            background: blockedReason ? "var(--surface-3)" : "var(--good-50)",
            color: blockedReason ? "var(--text-mute)" : "var(--good-700)",
            border: `1px solid ${blockedReason ? "var(--border)" : "var(--good-100)"}`,
            cursor: blockedReason ? "not-allowed" : "pointer",
            opacity: approveAccount.isPending ? 0.6 : 1,
          }}
        >
          {approveAccount.isPending ? "Approving…" : "✓ Approve account"}
        </button>

        {!isRemoved && (
          <button
            type="button"
            data-testid={`remove-account-${account.account_domain}`}
            onClick={() => setShowRemove((v) => !v)}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8,
              background: "var(--surface-2)", color: "var(--text-3)",
              border: "1px solid var(--border)", cursor: "pointer",
            }}
          >
            {showRemove ? "Cancel" : "✕ Remove"}
          </button>
        )}

        {blockedReason && (
          <span
            data-testid={`account-block-${account.account_domain}`}
            style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 999, padding: "3px 10px", fontWeight: 600 }}
          >
            ⚠ {blockedReason}
          </span>
        )}
      </div>

      {/* Remove reason input */}
      {showRemove && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for removal (required)"
            style={{
              flex: 1, padding: "8px 12px",
              border: "1.5px solid var(--bad-100)", borderRadius: 8,
              fontSize: 12, background: "var(--bad-50)", color: "var(--text)", outline: "none",
            }}
          />
          <button
            type="button"
            disabled={!reason.trim() || removeAccount.isPending}
            onClick={() => removeAccount.mutate(
              { domain: account.account_domain, reason: reason.trim() },
              { onSuccess: () => { setShowRemove(false); setReason(""); } },
            )}
            style={{
              fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 8,
              background: reason.trim() ? "var(--bad-500,#e0493c)" : "var(--surface-3)",
              color: reason.trim() ? "#fff" : "var(--text-mute)",
              border: "none", cursor: reason.trim() ? "pointer" : "not-allowed",
            }}
          >
            {removeAccount.isPending ? "Removing…" : "Confirm"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function BulkView({ clientId, state }: Props) {
  const summaries = useMemo(() => summarise(state), [state]);
  const eligible  = summaries.filter((s) => s.pendingClaims === 0).length;
  const approved  = summaries.filter((s) => s.account.account_decision === "APPROVED").length;

  const [approvingAll, setApprovingAll] = useState(false);
  const qc = useQueryClient();

  const approvableCount = summaries.filter(
    (s) => s.pendingClaims === 0 && s.account.account_decision !== "APPROVED" && s.account.account_decision !== "REMOVED_FROM_PIPELINE"
  ).length;

  async function handleApproveAll() {
    const toApprove = summaries.filter(
      (s) => s.pendingClaims === 0 && s.account.account_decision !== "APPROVED" && s.account.account_decision !== "REMOVED_FROM_PIPELINE"
    );
    if (!toApprove.length) return;
    setApprovingAll(true);
    try {
      for (const s of toApprove) {
        const { data } = await api.post(
          `/api/checkpoint-2/accounts/${encodeURIComponent(s.account.account_domain)}/approve`,
          { account_notes: null },
          { params: { client_id: clientId } },
        );
        qc.setQueryData(["cp2", clientId], data);
      }
    } finally {
      setApprovingAll(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Info banner + Approve All */}
      <div style={{
        background: "var(--acc-950)", border: "1px solid var(--acc-800)",
        borderRadius: 12, padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 13, color: "var(--acc-300)", lineHeight: 1.5, flex: 1 }}>
          <span style={{ fontWeight: 700, color: "var(--acc-200)" }}>Step 2 — Approve accounts</span>
          {" — "}An account is ready to approve once all its AI claims have been reviewed in the <strong style={{ color: "var(--acc-200)" }}>Review Claims</strong> tab.
          Approving keeps it in the pipeline. Removing it drops it permanently.
          <span style={{ marginLeft: 12, color: "var(--acc-400)", fontWeight: 600 }}>
            {eligible} ready · {approved} approved · {summaries.length} total
          </span>
        </div>
        <button
          type="button"
          disabled={approvableCount === 0 || approvingAll}
          onClick={handleApproveAll}
          style={{
            padding: "8px 18px", borderRadius: 9, border: "none", cursor: approvableCount === 0 || approvingAll ? "not-allowed" : "pointer",
            fontWeight: 700, fontSize: 13, flexShrink: 0,
            background: approvableCount === 0 || approvingAll
              ? "var(--surface-3)"
              : "linear-gradient(135deg, var(--acc-500), var(--acc-700))",
            color: approvableCount === 0 || approvingAll ? "var(--text-mute)" : "#fff",
            boxShadow: approvableCount === 0 || approvingAll ? "none" : "0 2px 10px rgba(91,80,245,0.3)",
            opacity: approvingAll ? 0.7 : 1,
            transition: "all 0.15s",
          }}
        >
          {approvingAll ? "Approving…" : `Approve All Eligible${approvableCount > 0 ? ` (${approvableCount})` : ""}`}
        </button>
      </div>

      {summaries.map((summary) => (
        <AccountRow key={summary.account.account_domain} clientId={clientId} summary={summary} />
      ))}

      {summaries.length === 0 && (
        <div style={{
          background: "var(--surface)", border: "1.5px dashed var(--border-strong)",
          borderRadius: 12, padding: "48px 24px", textAlign: "center",
          color: "var(--text-3)", fontSize: 14,
        }}>
          No accounts found.
        </div>
      )}
    </div>
  );
}
