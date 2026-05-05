import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, LoadingSpinner } from "../components/ui";
import { apiGet, apiPut } from "../lib/api";

type ReviewFilter = "all" | "approved" | "pending" | "rejected";
type ReviewStatus = Exclude<ReviewFilter, "all">;
type InferenceSection = "Pain Point" | "Strategy" | "Tech Stack";

interface InferredClaim {
  id: string;
  company: string;
  section: InferenceSection;
  statement: string;
  tag: "[INFERRED]";
  reviewStatus: ReviewStatus;
}

interface VerifyStatusPayload {
  inferred?: Array<Record<string, unknown>>;
}

const filterOptions: Array<{ label: string; value: ReviewFilter }> = [
  { label: "Show All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" }
];

const reviewStatusClasses: Record<ReviewStatus, string> = {
  approved: "border-green-200 bg-green-50 text-green-700",
  pending: "border-yellow-300 bg-yellow-50 text-yellow-900",
  rejected: "border-red-200 bg-red-50 text-red-700"
};

function unwrapData<T>(response: T | { data?: T }): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data?: T }).data ?? (response as T);
  }

  return response as T;
}

function normalizeSection(value: unknown): InferenceSection {
  if (value === "Pain Point" || value === "Strategy" || value === "Tech Stack") {
    return value;
  }

  return "Pain Point";
}

function normalizeReviewStatus(value: unknown): ReviewStatus {
  if (value === "approved" || value === "pending" || value === "rejected") {
    return value;
  }

  return "pending";
}

function normalizeClaims(claims: Array<Record<string, unknown>>): InferredClaim[] {
  return claims.map((claim, index) => ({
    id: String(claim.id ?? `inferred-${index + 1}`),
    company: String(claim.company ?? "Unknown company"),
    section: normalizeSection(claim.section),
    statement: String(claim.statement ?? ""),
    tag: "[INFERRED]",
    reviewStatus: normalizeReviewStatus(claim.reviewStatus)
  }));
}

async function fetchVerifyStatus(): Promise<VerifyStatusPayload> {
  const response = await apiGet<VerifyStatusPayload | { data?: VerifyStatusPayload }>("/api/verify/status");
  return unwrapData(response);
}

async function saveClaims(inferred: InferredClaim[]) {
  const response = await apiPut<{ savedAt: string } | { data?: { savedAt: string } }, { inferred: InferredClaim[] }>(
    "/api/verify/status",
    { inferred }
  );
  return unwrapData(response);
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-48 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

export function InferenceReviewPanel() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [draftClaims, setDraftClaims] = useState<InferredClaim[]>([]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["verify-status", "inferred-review"],
    queryFn: fetchVerifyStatus
  });

  const saveMutation = useMutation({
    mutationFn: saveClaims,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["verify-status"] });
      await queryClient.invalidateQueries({ queryKey: ["verify-status", "inferred-review"] });
    }
  });

  const claims = useMemo(() => {
    if (draftClaims.length > 0) {
      return draftClaims;
    }

    return normalizeClaims(data?.inferred ?? []);
  }, [data?.inferred, draftClaims]);

  const filteredClaims = useMemo(() => {
    if (filter === "all") {
      return claims;
    }

    return claims.filter((claim) => claim.reviewStatus === filter);
  }, [claims, filter]);

  const reviewedCount = claims.filter((claim) => claim.reviewStatus !== "pending").length;

  function updateClaim(claimId: string, updates: Partial<InferredClaim>) {
    setDraftClaims((current) => {
      const base = current.length > 0 ? current : normalizeClaims(data?.inferred ?? []);
      return base.map((claim) => (claim.id === claimId ? { ...claim, ...updates } : claim));
    });
  }

  function handleBulkApprove() {
    setDraftClaims((current) => {
      const base = current.length > 0 ? current : normalizeClaims(data?.inferred ?? []);
      return base.map((claim) => ({ ...claim, reviewStatus: "approved" }));
    });
  }

  function handleSave() {
    saveMutation.mutate(claims);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 shadow-sm">
        <p className="text-sm font-semibold text-yellow-900">These claims will be used in outreach. Review carefully.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-accent">Inference Review Panel</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">Review inferred intelligence before messaging</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Approve, reject, or refine inferred claims so only reviewed intelligence reaches outreach.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {reviewedCount}/{claims.length} reviewed
              </p>
            </div>
            <Button label="Bulk Approve" onClick={handleBulkApprove} variant="secondary" size="md" disabled={claims.length === 0} />
            <Button label="Save" onClick={handleSave} variant="primary" size="md" loading={saveMutation.isPending} disabled={claims.length === 0} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <label className="block sm:w-64">
            <span className="mb-2 block text-sm font-medium text-slate-700">Filter</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as ReviewFilter)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {isFetching ? <LoadingSpinner size="sm" label="Refreshing inferred claims" /> : null}
        </div>

        <div className="pt-6">
          {isLoading ? (
            <ReviewSkeleton />
          ) : isError ? (
            <EmptyState
              icon="!"
              heading="Unable to load inferred claims"
              subtext="The review feed could not be fetched right now. Try again in a moment."
              action={{ label: "Retry", onClick: () => void refetch() }}
            />
          ) : filteredClaims.length === 0 ? (
            <EmptyState
              icon="[]"
              heading="No claims in this view"
              subtext="Try a different filter or run verification again to generate more inferred intelligence."
            />
          ) : (
            <div className="grid gap-4">
              {filteredClaims.map((claim) => (
                <article
                  key={claim.id}
                  className={`rounded-xl border p-5 shadow-sm transition ${reviewStatusClasses[claim.reviewStatus]}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-yellow-300 bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-900">
                          {claim.tag}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                          {claim.section}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{claim.company}</span>
                      </div>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Statement</span>
                        <textarea
                          value={claim.statement}
                          onChange={(event) => updateClaim(claim.id, { statement: event.target.value })}
                          rows={4}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:w-56 lg:justify-end">
                      <Button
                        label="Approve"
                        onClick={() => updateClaim(claim.id, { reviewStatus: "approved" })}
                        variant="secondary"
                        size="sm"
                      />
                      <Button
                        label="Reject"
                        onClick={() => updateClaim(claim.id, { reviewStatus: "rejected" })}
                        variant="danger"
                        size="sm"
                      />
                      <Button
                        label="Edit"
                        onClick={() => updateClaim(claim.id, { reviewStatus: "pending" })}
                        variant="ghost"
                        size="sm"
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
