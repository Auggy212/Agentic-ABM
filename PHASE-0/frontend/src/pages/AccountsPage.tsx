import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, LoadingSpinner } from "../components/ui";
import { apiGet } from "../lib/api";
import type { Account, AccountTier, AccountsListResponse } from "../types/api.types";

type ApiSuccess<T> = {
  success: boolean;
  data: T;
};

type SortDirection = "desc" | "asc";
type TierFilter = "all" | AccountTier;

const tierLabelMap: Record<AccountTier, string> = {
  T1: "Tier 1",
  T2: "Tier 2",
  T3: "Tier 3"
};

const tierVariantMap: Record<AccountTier, "tier1" | "tier2" | "tier3"> = {
  T1: "tier1",
  T2: "tier2",
  T3: "tier3"
};

async function fetchAccounts() {
  const response = await apiGet<ApiSuccess<AccountsListResponse>>("/api/accounts");
  return response.data;
}

export function AccountsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts
  });

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return [...(data?.items ?? [])]
      .filter((account) => (tierFilter === "all" ? true : account.tier === tierFilter))
      .filter((account) => account.name.toLowerCase().includes(normalizedSearch))
      .sort((left, right) => {
        return sortDirection === "desc" ? right.icpScore - left.icpScore : left.icpScore - right.icpScore;
      });
  }, [data?.items, searchTerm, sortDirection, tierFilter]);

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-900 px-6 py-6 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-200">Accounts Dashboard</p>
              <h2 className="mt-3 text-2xl font-semibold">Prioritized target accounts</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-200">
                Review ICP-scored companies, narrow by tier, and quickly spot the highest-priority accounts for activation.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
              {isFetching && !isLoading ? "Refreshing account data..." : `${filteredAccounts.length} account${filteredAccounts.length === 1 ? "" : "s"} shown`}
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Search company</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by company name"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Filter by tier</span>
              <select
                value={tierFilter}
                onChange={(event) => setTierFilter(event.target.value as TierFilter)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              >
                <option value="all">All tiers</option>
                <option value="T1">Tier 1</option>
                <option value="T2">Tier 2</option>
                <option value="T3">Tier 3</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Sort by ICP score</span>
              <select
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as SortDirection)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              >
                <option value="desc">Highest first</option>
                <option value="asc">Lowest first</option>
              </select>
            </label>
          </div>

          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-slate-200 bg-slate-50">
              <LoadingSpinner size="lg" label="Loading accounts..." />
            </div>
          ) : null}

          {isError && !isLoading ? (
            <EmptyState
              icon="!"
              heading="Unable to load accounts"
              subtext="The dashboard could not fetch account data from /api/accounts. Try again to refresh the list."
              action={{ label: "Retry", onClick: () => void refetch() }}
            />
          ) : null}

          {!isLoading && !isError && filteredAccounts.length === 0 ? (
            <EmptyState
              icon="0"
              heading="No matching accounts"
              subtext="Adjust the company search, tier filter, or score sort to see more results."
            />
          ) : null}

          {!isLoading && !isError && filteredAccounts.length > 0 ? (
            <div className="overflow-hidden rounded-3xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse bg-white">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Company Name
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Industry
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Location
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        ICP Score
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((account) => (
                      <AccountRow key={account.id} account={account} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AccountRow({ account }: { account: Account }) {
  return (
    <tr className="border-t border-slate-200 transition hover:bg-emerald-50/50">
      <td className="px-5 py-4 text-sm text-slate-700">
        <div>
          <p className="font-semibold text-slate-900">{account.name}</p>
          <p className="mt-1 text-xs text-slate-500">{account.domain}</p>
        </div>
      </td>
      <td className="px-5 py-4 text-sm text-slate-700">{account.industry || "Unknown"}</td>
      <td className="px-5 py-4 text-sm text-slate-700">{account.geography || "Not provided"}</td>
      <td className="px-5 py-4 text-sm text-slate-700">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(account.icpScore, 100))}%` }} />
          </div>
          <span className="font-semibold text-slate-900">{account.icpScore}</span>
        </div>
      </td>
      <td className="px-5 py-4 text-sm text-slate-700">
        <Badge label={tierLabelMap[account.tier]} variant={tierVariantMap[account.tier]} />
      </td>
    </tr>
  );
}
