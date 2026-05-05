import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBuyers as fetchBuyersRequest } from "../api/api";
import { EmptyState } from "../components/ui";
import { mockBuyersResponse } from "../mocks/data";
import { useStore } from "../store/useStore";
import type { BuyerContact, BuyersResponse, CommitteeRole, EmailStatus } from "../types/api.types";

type RoleFilter = "all" | CommitteeRole;

const roleOptions: { label: string; value: RoleFilter }[] = [
  { label: "All roles", value: "all" },
  { label: "Decision Maker", value: "decision_maker" },
  { label: "Champion", value: "champion" },
  { label: "Blocker", value: "blocker" },
  { label: "Influencer", value: "influencer" }
];

const contactRoleOptions: { label: string; value: Exclude<RoleFilter, "all"> }[] = roleOptions.filter(
  (option): option is { label: string; value: Exclude<RoleFilter, "all"> } => option.value !== "all"
);

const roleLabelByValue: Record<CommitteeRole, string> = {
  decision_maker: "Decision Maker",
  champion: "Champion",
  blocker: "Blocker",
  influencer: "Influencer",
  user: "User"
};

const roleClassesByValue: Record<CommitteeRole, string> = {
  decision_maker: "border-blue-200 bg-blue-50 text-blue-700",
  champion: "border-green-200 bg-green-50 text-green-700",
  blocker: "border-red-200 bg-red-50 text-red-700",
  influencer: "border-yellow-200 bg-yellow-50 text-yellow-700",
  user: "border-slate-200 bg-slate-100 text-slate-700"
};

const emailClassesByStatus: Record<EmailStatus, string> = {
  valid: "border-green-200 bg-green-50 text-green-700",
  invalid: "border-red-200 bg-red-50 text-red-700",
  unknown: "border-slate-200 bg-slate-100 text-slate-600"
};

async function fetchBuyers(company: string): Promise<BuyersResponse> {
  const { data, error } = await fetchBuyersRequest(company);

  if (error) {
    if (import.meta.env.DEV) {
      return {
        ...mockBuyersResponse,
        companyDomain: company
      };
    }

    throw new Error(error.message);
  }

  return data ?? { companyDomain: company, committeeSize: 0, contacts: [] };
}

function normalizeContacts(contacts: BuyerContact[]) {
  return contacts.map((contact) => ({
    ...contact,
    emailStatus: contact.emailStatus ?? "unknown",
    painPointsSummary: contact.painPointsSummary ?? "No pain points summary available yet."
  }));
}

function BuyerCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="animate-pulse space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-5 w-40 rounded bg-slate-200" />
            <div className="h-4 w-32 rounded bg-slate-100" />
          </div>
          <div className="h-7 w-28 rounded-full bg-slate-100" />
        </div>
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="h-12 rounded-lg bg-slate-100" />
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="h-4 w-5/6 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export function BuyerIntelPage() {
  const selectedCompany = useStore((state) => state.selectedCompany);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [nameSearch, setNameSearch] = useState("");

  const {
    data,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["buyers", selectedCompany?.domain],
    queryFn: () => fetchBuyers(selectedCompany?.domain ?? ""),
    enabled: Boolean(selectedCompany?.domain)
  });

  const contacts = useMemo(() => normalizeContacts(data?.contacts ?? []), [data?.contacts]);
  const normalizedNameSearch = nameSearch.trim().toLowerCase();

  const filteredContacts = contacts.filter((contact) => {
    const matchesRole = roleFilter === "all" ? true : contact.committeeRole === roleFilter;
    const matchesName = contact.fullName.toLowerCase().includes(normalizedNameSearch);
    return matchesRole && matchesName;
  });

  const roleCounts = contacts.reduce<Record<RoleFilter, number>>(
    (counts, contact) => {
      counts.all += 1;
      counts[contact.committeeRole] += 1;
      return counts;
    },
    { all: 0, decision_maker: 0, champion: 0, blocker: 0, influencer: 0, user: 0 }
  );

  const hasActiveFilters = roleFilter !== "all" || normalizedNameSearch.length > 0;
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-accent">Buyer Intel Dashboard</p>
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">Map the buying committee fast</h3>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Pull contact intel by company domain, scan who can move a deal forward, and spot risk before outreach
                starts.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</p>
              <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                {selectedCompany?.name || selectedCompany?.domain || "No company selected"}
              </p>
              {selectedCompany?.domain ? <p className="mt-1 text-xs text-slate-500">{selectedCompany.domain}</p> : null}
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Contacts</p>
              <p className="mt-2 text-2xl font-semibold text-blue-900">{contacts.length}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Recent Changes</p>
              <p className="mt-2 text-2xl font-semibold text-amber-900">
                {contacts.filter((contact) => contact.recentJobChange).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-end">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-700">Company source</p>
              <p className="mt-2 text-sm text-slate-600">
                Buyer intel automatically follows the company selected in the global account dropdown.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Filter by role</span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                  ))}
                </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <label className="block xl:max-w-md">
              <span className="mb-2 block text-sm font-medium text-slate-700">Search by name</span>
              <input
                type="search"
                value={nameSearch}
                onChange={(event) => setNameSearch(event.target.value)}
                placeholder="Search contacts"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {contactRoleOptions.map((option) => (
                <div
                  key={option.value}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    roleClassesByValue[option.value]
                  }`}
                >
                  <span>{option.label}</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-slate-700">
                    {roleCounts[option.value]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-6">
          {!selectedCompany?.domain ? (
            <EmptyState
              icon="[]"
              heading="Select a company"
              subtext="Choose a company from the global account dropdown to load buyer contacts."
            />
          ) : isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <BuyerCardSkeleton key={index} />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon="!"
              heading="Unable to load buyer contacts"
              subtext="The buyer intel request did not complete. Try the fetch again in a moment."
              action={{ label: "Retry", onClick: () => void refetch() }}
            />
          ) : filteredContacts.length === 0 ? (
            <EmptyState
              icon={hasActiveFilters ? "0" : "[]"}
              heading={hasActiveFilters ? "No matching contacts" : "No contacts found"}
              subtext={
                hasActiveFilters
                  ? "Try a different role filter or broaden the name search."
                  : "This company does not have buyer contacts yet for the selected domain."
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  Showing <span className="font-semibold text-slate-900">{filteredContacts.length}</span> of{" "}
                  <span className="font-semibold text-slate-900">{contacts.length}</span> contacts
                </p>
                {data ? (
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Committee size: {data.committeeSize}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {filteredContacts.map((contact) => (
                  <article
                    key={contact.contactId}
                    className={`rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      contact.recentJobChange
                        ? "border-amber-300 ring-1 ring-amber-200"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-lg font-semibold text-slate-900">{contact.fullName}</h4>
                        <p className="mt-1 text-sm text-slate-600">{contact.title}</p>
                      </div>

                      <span
                        className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                          roleClassesByValue[contact.committeeRole]
                        }`}
                      >
                        {roleLabelByValue[contact.committeeRole]}
                      </span>
                    </div>

                    {contact.recentJobChange ? (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                        Recent job change
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                          <p className="mt-1 break-all text-sm font-medium text-slate-900">{contact.email}</p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                            emailClassesByStatus[contact.emailStatus ?? "unknown"]
                          }`}
                        >
                          {contact.emailStatus ?? "unknown"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">LinkedIn</p>
                      <a
                        href={contact.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-sm font-medium text-brand-primary underline-offset-2 transition hover:text-brand-accent hover:underline"
                      >
                        View profile
                      </a>
                    </div>

                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pain points</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{contact.painPointsSummary}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
