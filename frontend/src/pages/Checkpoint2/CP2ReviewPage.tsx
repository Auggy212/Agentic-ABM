import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import BulkView from "./BulkView";
import CP2ApprovalFooter from "./CP2ApprovalFooter";
import PerClaimView from "./PerClaimView";
import { DEFAULT_CP2_CLIENT_ID, useCP2State } from "./hooks";

const STATUS_TONE: Record<string, string> = {
  NOT_STARTED: "var(--text-3)",
  IN_REVIEW: "#b45309",
  APPROVED: "#15803d",
  REJECTED: "#b91c1c",
};

export default function CP2ReviewPage() {
  const [params] = useSearchParams();
  const clientId = params.get("client_id") || DEFAULT_CP2_CLIENT_ID;
  const [tab, setTab] = useState<"per-claim" | "bulk">("per-claim");
  const query = useCP2State(clientId);

  if (query.isLoading) {
    return (
      <div className="page-body" style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
        <LoadingSpinner size="lg" label="Loading CP2 review" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="page-body">
        <div className="card card-pad" style={{ color: "var(--text-3)", textAlign: "center" }}>
          CP2 review state is not available yet.
        </div>
      </div>
    );
  }

  const state = query.data;
  const progress = state.aggregate_progress;

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>
          Checkpoint 2 Review
        </h1>
        <div className="page-head-meta" style={{ marginLeft: 12 }}>
          Phase 4 (Storyteller) is locked until you approve.
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="card card-pad" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span
                data-testid="cp2-status-pill"
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  background: "var(--surface-2)",
                  color: STATUS_TONE[state.status] ?? "inherit",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {state.status}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {state.reviewer || "no reviewer"} · opened{" "}
                {state.opened_at ? new Date(state.opened_at).toLocaleString() : "—"}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {progress.reviewed_claims} of {progress.total_inferred_claims} claims reviewed ·{" "}
              {progress.approved_accounts} of {progress.total_accounts} accounts approved
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div
              style={{
                height: 8,
                background: "var(--border)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                data-testid="claims-progress-bar"
                style={{
                  width: progress.total_inferred_claims
                    ? `${(progress.reviewed_claims / progress.total_inferred_claims) * 100}%`
                    : "0%",
                  background: "#15803d",
                  height: "100%",
                }}
              />
            </div>
            <div
              style={{
                height: 8,
                background: "var(--border)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                data-testid="accounts-progress-bar"
                style={{
                  width: progress.total_accounts
                    ? `${(progress.approved_accounts / progress.total_accounts) * 100}%`
                    : "0%",
                  background: "#1d4ed8",
                  height: "100%",
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)" }}>
          <button
            type="button"
            data-testid="tab-per-claim"
            onClick={() => setTab("per-claim")}
            className={tab === "per-claim" ? "btn-primary" : "btn-ghost"}
            style={{ borderRadius: "8px 8px 0 0" }}
          >
            Per-Claim Review
          </button>
          <button
            type="button"
            data-testid="tab-bulk"
            onClick={() => setTab("bulk")}
            className={tab === "bulk" ? "btn-primary" : "btn-ghost"}
            style={{ borderRadius: "8px 8px 0 0" }}
          >
            Bulk Review
          </button>
        </div>

        {tab === "per-claim" ? (
          <PerClaimView clientId={clientId} state={state} />
        ) : (
          <BulkView clientId={clientId} state={state} />
        )}
      </div>

      <CP2ApprovalFooter clientId={clientId} state={state} />
    </>
  );
}
