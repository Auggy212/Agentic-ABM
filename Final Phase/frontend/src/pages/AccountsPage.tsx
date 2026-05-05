import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccounts as fetchAccountsRequest } from "../api/api";
import { mockAccountsListResponse } from "../mocks/data";
import { Badge, EmptyState, LoadingSpinner } from "../components/ui";
import type { Account, AccountTier } from "../types/api.types";

type TierFilter = "all" | AccountTier;
type ScoreSortDirection = "desc" | "asc";

const tierOptions: { label: string; value: TierFilter }[] = [
  { label: "All tiers", value: "all" },
  { label: "Tier 1", value: "T1" },
  { label: "Tier 2", value: "T2" },
  { label: "Tier 3", value: "T3" }
];

const badgeVariantByTier: Record<AccountTier, "tier1" | "tier2" | "tier3"> = {
  T1: "tier1",
  T2: "tier2",
  T3: "tier3"
};

const tierLabelByTier: Record<AccountTier, string> = {
  T1: "Tier 1",
  T2: "Tier 2",
  T3: "Tier 3"
};

async function fetchAccounts() {
  const { data, error } = await fetchAccountsRequest();

  if (error) {
    if (import.meta.env.DEV) {
      return mockAccountsListResponse.items;
    }

    throw new Error(error.message);
  }

  return data ?? [];
}

function formatLocation(account: Account) {
  return account.geography ?? "Unknown";
}

export function AccountsPage() {
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [scoreSortDirection, setScoreSortDirection] = useState<ScoreSortDirection>("desc");

  const {
    data: accounts = [],
    isLoading,
    isError,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts
  });

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredAccounts = accounts
    .filter((account) => (tierFilter === "all" ? true : account.tier === tierFilter))
    .filter((account) => account.name.toLowerCase().includes(normalizedSearchTerm))
    .sort((left, right) =>
      scoreSortDirection === "desc" ? right.icpScore - left.icpScore : left.icpScore - right.icpScore
    );

  const hasActiveFilters = tierFilter !== "all" || normalizedSearchTerm.length > 0;
  const tierCounts = accounts.reduce<Record<AccountTier, number>>(
    (counts, account) => {
      counts[account.tier] += 1;
      return counts;
    },
    { T1: 0, T2: 0, T3: 0 }
  );

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-accent">ICP Scout</p>
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">Accounts dashboard</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Review target companies, scan ICP fit, and narrow the list by tier or name before handing off the
                next move.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Accounts</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{accounts.length}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Tier 1</p>
              <p className="mt-2 text-2xl font-semibold text-green-900">{tierCounts.T1}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Tier 2+</p>
              <p className="mt-2 text-2xl font-semibold text-amber-900">{tierCounts.T2 + tierCounts.T3}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-4 sm:grid-cols-2 lg:w-full lg:max-w-3xl lg:grid-cols-[minmax(0,1.6fr)_220px]">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Search company name</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search accounts"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Tier filter</span>
                <select
                  value={tierFilter}
                  onChange={(event) => setTierFilter(event.target.value as TierFilter)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                >
                  {tierOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() =>
                setScoreSortDirection((currentDirection) => (currentDirection === "desc" ? "asc" : "desc"))
              }
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Sort ICP Score: {scoreSortDirection === "desc" ? "High to Low" : "Low to High"}
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          {isLoading ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
              <LoadingSpinner size="lg" label="Loading accounts..." />
            </div>
          ) : isError ? (
            <EmptyState
              icon="!"
              heading="Unable to load accounts"
              subtext="The accounts list could not be fetched right now. Try refreshing the data."
              action={{ label: "Retry", onClick: () => void refetch() }}
            />
          ) : filteredAccounts.length === 0 ? (
            <EmptyState
              icon={hasActiveFilters ? "0" : "[]"}
              heading={hasActiveFilters ? "No matching accounts" : "No accounts yet"}
              subtext={
                hasActiveFilters
                  ? "Try a different company name or tier filter to widen the list."
                  : "Accounts will appear here once GET /api/accounts returns company data."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-600">
                  Showing <span className="font-semibold text-slate-900">{filteredAccounts.length}</span> of{" "}
                  <span className="font-semibold text-slate-900">{accounts.length}</span> accounts
                </p>
                {isFetching ? <span className="text-xs font-medium text-slate-500">Refreshing...</span> : null}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Company Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Industry
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Location
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        ICP Score
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Tier
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((account, index) => (
                      <tr
                        key={account.id}
                        className={`border-t border-slate-200 transition hover:bg-brand-light/30 ${
                          index % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                        }`}
                      >
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <div>
                            <p className="font-semibold text-slate-900">{account.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{account.domain}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">{account.industry}</td>
                        <td className="px-4 py-4 text-sm text-slate-700">{formatLocation(account)}</td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <span className="inline-flex min-w-14 items-center justify-center rounded-md bg-slate-100 px-2.5 py-1 font-semibold text-slate-900">
                            {account.icpScore}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <Badge label={tierLabelByTier[account.tier]} variant={badgeVariantByTier[account.tier]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
