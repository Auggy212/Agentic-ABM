import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRunVerificationMutation, useVerificationStatusQuery } from "../api/api";
import { EmptyState, LoadingSpinner, StatusBadge } from "../components/ui";

type EmailStatus = "VALID" | "INVALID" | "CATCH_ALL" | "UNKNOWN";
type LinkedInStatus = "ACTIVE" | "BROKEN" | "UNKNOWN";
type JobTitleMatch = "MATCH" | "MISMATCH" | "UNKNOWN";
type StatusFilter = "ALL" | EmailStatus;

interface VerificationContact {
  id: string;
  name: string;
  company: string;
  email: string;
  emailStatus: EmailStatus;
  linkedinStatus: LinkedInStatus;
  jobTitleMatch: JobTitleMatch;
  flags: string[];
}

interface VerifyStatusPayload {
  verificationId?: string;
  status?: "queued" | "running" | "completed" | "failed";
  completedAt?: string | null;
  lastRunAt?: string | null;
  passed?: number;
  failed?: number;
  summary?: {
    totalContacts?: number;
    contactsChecked?: number;
    validEmails?: number;
    invalidEmails?: number;
    catchAllEmails?: number;
    unknownEmails?: number;
    passRate?: number;
  };
  contacts?: Array<Record<string, unknown>>;
}

const statusOptions: { label: string; value: StatusFilter }[] = [
  { label: "All statuses", value: "ALL" },
  { label: "Valid", value: "VALID" },
  { label: "Invalid", value: "INVALID" },
  { label: "Catch-all", value: "CATCH_ALL" },
  { label: "Unknown", value: "UNKNOWN" }
];

const emailStatusOrder: Record<EmailStatus, number> = {
  VALID: 1,
  CATCH_ALL: 2,
  UNKNOWN: 3,
  INVALID: 4
};

function normalizeEmailStatus(value: unknown): EmailStatus {
  const normalized = String(value ?? "UNKNOWN").trim().toUpperCase().replace(/-/g, "_");

  if (normalized === "VALID" || normalized === "INVALID" || normalized === "CATCH_ALL") {
    return normalized;
  }

  return "UNKNOWN";
}

function normalizeLinkedInStatus(value: unknown): LinkedInStatus {
  const normalized = String(value ?? "UNKNOWN").trim().toUpperCase().replace(/-/g, "_");

  if (normalized === "ACTIVE" || normalized === "BROKEN") {
    return normalized;
  }

  return "UNKNOWN";
}

function normalizeJobTitleMatch(value: unknown): JobTitleMatch {
  const normalized = String(value ?? "UNKNOWN").trim().toUpperCase().replace(/-/g, "_");

  if (normalized === "MATCH" || normalized === "MISMATCH") {
    return normalized;
  }

  return "UNKNOWN";
}

function normalizeContact(contact: Record<string, unknown>, index: number): VerificationContact {
  const flags = Array.isArray(contact.flags)
    ? contact.flags.map(String)
    : [
        contact.recentJobChange || contact.jobChange ? "Job Change" : null,
        contact.missingData ? "Missing Data" : null
      ].filter((flag): flag is string => Boolean(flag));

  return {
    id: String(contact.id ?? contact.contactId ?? `${contact.email ?? "contact"}-${index}`),
    name: String(contact.name ?? contact.fullName ?? "Unknown contact"),
    company: String(contact.company ?? contact.accountName ?? contact.companyName ?? "Unknown company"),
    email: String(contact.email ?? "No email"),
    emailStatus: normalizeEmailStatus(contact.emailStatus ?? contact.status),
    linkedinStatus: normalizeLinkedInStatus(contact.linkedinStatus),
    jobTitleMatch: normalizeJobTitleMatch(contact.jobTitleMatch),
    flags
  };
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Not run yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className={`rounded-lg border px-4 py-4 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function VerifierSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg bg-slate-100" />
    </div>
  );
}

export function VerifierPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const { data, isLoading, isError, isFetching, refetch } = useVerificationStatusQuery({
    select: (response: VerifyStatusPayload) => response
  });

  const runVerificationMutation = useRunVerificationMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["verification-status"] });
    }
  });

  const contacts = useMemo(
    () => (data?.contacts ?? []).map((contact, index) => normalizeContact(contact, index)),
    [data?.contacts]
  );

  const summary = useMemo(() => {
    const validEmails = data?.summary?.validEmails ?? contacts.filter((contact) => contact.emailStatus === "VALID").length;
    const invalidEmails =
      data?.summary?.invalidEmails ?? data?.failed ?? contacts.filter((contact) => contact.emailStatus === "INVALID").length;
    const catchAllEmails =
      data?.summary?.catchAllEmails ?? contacts.filter((contact) => contact.emailStatus === "CATCH_ALL").length;
    const unknownEmails = data?.summary?.unknownEmails ?? contacts.filter((contact) => contact.emailStatus === "UNKNOWN").length;
    const totalContacts = data?.summary?.totalContacts ?? data?.summary?.contactsChecked ?? contacts.length;
    const passRate =
      typeof data?.summary?.passRate === "number"
        ? data.summary.passRate > 1
          ? data.summary.passRate
          : data.summary.passRate * 100
        : totalContacts > 0
          ? (validEmails / totalContacts) * 100
          : 0;

    return { totalContacts, validEmails, invalidEmails, catchAllEmails, unknownEmails, passRate };
  }, [contacts, data]);

  const filteredContacts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return contacts
      .filter((contact) => {
        const matchesStatus = statusFilter === "ALL" || contact.emailStatus === statusFilter;
        const matchesSearch =
          normalizedSearch.length === 0 ||
          contact.name.toLowerCase().includes(normalizedSearch) ||
          contact.company.toLowerCase().includes(normalizedSearch);

        return matchesStatus && matchesSearch;
      })
      .sort((left, right) => {
        const result = emailStatusOrder[left.emailStatus] - emailStatusOrder[right.emailStatus];
        return sortDirection === "asc" ? result : -result;
      });
  }, [contacts, searchTerm, sortDirection, statusFilter]);

  const hasActiveFilters = statusFilter !== "ALL" || searchTerm.trim().length > 0;
  const lastRunAt = data?.lastRunAt ?? data?.completedAt ?? null;

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-accent">Verifier Dashboard</p>
            <h3 className="mt-3 text-2xl font-semibold text-slate-900">Validate contacts before outreach</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Review email deliverability, LinkedIn health, title confidence, and data quality flags from one focused
              verification workspace.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last run</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(lastRunAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => runVerificationMutation.mutate()}
              disabled={runVerificationMutation.isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {runVerificationMutation.isPending ? "Running..." : "Run Verification"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {isLoading ? (
          <VerifierSkeleton />
        ) : isError ? (
          <EmptyState
            icon="!"
            heading="Unable to load verification status"
            subtext="The verifier status request did not complete. Try again in a moment."
            action={{ label: "Retry", onClick: () => void refetch() }}
          />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Total contacts" value={summary.totalContacts} tone="border-slate-200 bg-slate-50 text-slate-900" />
              <SummaryCard label="Valid emails" value={summary.validEmails} tone="border-green-200 bg-green-50 text-green-900" />
              <SummaryCard label="Invalid emails" value={summary.invalidEmails} tone="border-red-200 bg-red-50 text-red-900" />
              <SummaryCard label="Catch-all emails" value={summary.catchAllEmails} tone="border-yellow-200 bg-yellow-50 text-yellow-900" />
              <SummaryCard label="Pass rate" value={`${summary.passRate.toFixed(1)}%`} tone="border-blue-200 bg-blue-50 text-blue-900" />
            </div>

            <div className="rounded-lg border border-slate-200">
              <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_220px_180px] lg:items-end">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Search by name or company</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search contacts"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Email status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
                >
                  Sort status {sortDirection === "asc" ? "A-Z" : "Z-A"}
                </button>
              </div>

              {isFetching ? (
                <div className="border-b border-slate-200 px-4 py-3">
                  <LoadingSpinner size="sm" label="Refreshing verifier status" />
                </div>
              ) : null}

              {filteredContacts.length === 0 ? (
                <div className="px-4 py-10">
                  <EmptyState
                    icon="[]"
                    heading={hasActiveFilters ? "No matching contacts" : "No verified contacts yet"}
                    subtext={
                      hasActiveFilters
                        ? "Try a different email status filter or broaden the search."
                        : "Run verification to populate the contact table when status data is available."
                    }
                    action={!hasActiveFilters ? { label: "Run Verification", onClick: () => runVerificationMutation.mutate() } : undefined}
                  />
                </div>
              ) : (
                <div className="max-h-[620px] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-white shadow-sm">
                      <tr>
                        {["Name", "Company", "Email", "Email Status", "LinkedIn Status", "Job Title Match", "Flags"].map((column) => (
                          <th key={column} scope="col" className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredContacts.map((contact) => (
                        <tr key={contact.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">{contact.name}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-slate-700">{contact.company}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">{contact.email}</td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <StatusBadge type="Email Status" status={contact.emailStatus} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <StatusBadge type="LinkedIn Status" status={contact.linkedinStatus} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <StatusBadge type="Title Match" status={contact.jobTitleMatch} />
                          </td>
                          <td className="min-w-48 px-4 py-4">
                            {contact.flags.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {contact.flags.map((flag) => (
                                  <span key={flag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                    {flag}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">None</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
