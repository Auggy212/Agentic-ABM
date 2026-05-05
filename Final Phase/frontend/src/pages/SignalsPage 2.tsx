import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSignals as fetchSignalsRequest } from "../api/api";
import { EmptyState } from "../components/ui";
import { mockSignalsResponse } from "../mocks/data";
import { useStore } from "../store/useStore";
import type { BuyingStage, IntentSignal, SignalsResponse, SignalType } from "../types/api.types";

const stageOrder: BuyingStage[] = [
  "unaware",
  "problem_aware",
  "solution_aware",
  "evaluating",
  "ready_to_buy"
];

const stageLabelByValue: Record<BuyingStage, string> = {
  unaware: "UNAWARE",
  aware: "PROBLEM_AWARE",
  consideration: "SOLUTION_AWARE",
  decision: "READY_TO_BUY",
  problem_aware: "PROBLEM_AWARE",
  solution_aware: "SOLUTION_AWARE",
  evaluating: "EVALUATING",
  ready_to_buy: "READY_TO_BUY"
};

const stageClassesByValue: Record<BuyingStage, string> = {
  unaware: "border-slate-200 bg-slate-100 text-slate-700",
  aware: "border-blue-200 bg-blue-100 text-blue-700",
  consideration: "border-indigo-200 bg-indigo-100 text-indigo-700",
  decision: "border-emerald-200 bg-emerald-100 text-emerald-700",
  problem_aware: "border-blue-200 bg-blue-100 text-blue-700",
  solution_aware: "border-indigo-200 bg-indigo-100 text-indigo-700",
  evaluating: "border-amber-200 bg-amber-100 text-amber-700",
  ready_to_buy: "border-emerald-200 bg-emerald-100 text-emerald-700"
};

const signalTypeLabelByValue: Record<SignalType, string> = {
  funding: "Funding",
  hiring: "Hiring",
  news: "News",
  tech_change: "Tech Change",
  web_activity: "Web Activity",
  engagement: "Engagement",
  intent_data: "Intent Data"
};

type SignalIntensity = "HIGH" | "MEDIUM" | "LOW";

const intensityClassesByValue: Record<SignalIntensity, string> = {
  HIGH: "border-red-200 bg-red-50 text-red-700",
  MEDIUM: "border-yellow-200 bg-yellow-50 text-yellow-700",
  LOW: "border-green-200 bg-green-50 text-green-700"
};

const reportSections: Array<{
  key: keyof SignalsResponse["intelReport"];
  title: string;
}> = [
  { key: "companySnapshot", title: "Company Snapshot" },
  { key: "strategicPriorities", title: "Strategic Priorities" },
  { key: "techStack", title: "Tech Stack" },
  { key: "painPoints", title: "Pain Points" },
  { key: "recentNews", title: "Recent News" }
];

async function fetchSignals(company: string): Promise<SignalsResponse> {
  const { data, error } = await fetchSignalsRequest(company);

  if (error) {
    if (import.meta.env.DEV) {
      return {
        ...mockSignalsResponse,
        companyDomain: company
      };
    }

    throw new Error(error.message);
  }

  return data ?? { companyDomain: company, buyingStage: "unaware", intentScore: 0, signals: [], intelReport: {
    companySnapshot: [],
    strategicPriorities: [],
    techStack: [],
    painPoints: [],
    recentNews: []
  } };
}

function getIntensity(signal: IntentSignal): SignalIntensity {
  if (signal.strength >= 70) {
    return "HIGH";
  }

  if (signal.strength >= 40) {
    return "MEDIUM";
  }

  return "LOW";
}

function getStageProgress(stage: BuyingStage) {
  const normalizedStage =
    stage === "aware" ? "problem_aware" : stage === "consideration" ? "solution_aware" : stage === "decision" ? "ready_to_buy" : stage;
  const stageIndex = stageOrder.indexOf(normalizedStage);
  return stageIndex < 0 ? 0 : ((stageIndex + 1) / stageOrder.length) * 100;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function SignalsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-52 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-16 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SignalsPage() {
  const selectedCompany = useStore((state) => state.selectedCompany);
  const [openSection, setOpenSection] = useState<keyof SignalsResponse["intelReport"] | null>("companySnapshot");

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ["signals", selectedCompany?.domain],
    queryFn: () => fetchSignals(selectedCompany?.domain ?? ""),
    enabled: Boolean(selectedCompany?.domain)
  });

  const sortedSignals = useMemo(
    () => [...(data?.signals ?? [])].sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime()),
    [data?.signals]
  );

  const highCount = sortedSignals.filter((signal) => getIntensity(signal) === "HIGH").length;
  const mediumCount = sortedSignals.filter((signal) => getIntensity(signal) === "MEDIUM").length;
  const lowCount = sortedSignals.filter((signal) => getIntensity(signal) === "LOW").length;
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-accent">
              Signal & Intelligence Dashboard
            </p>
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">Read intent before the first touch</h3>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Pull account signals, understand buying stage, and review the strategic context that should shape
                outreach.
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
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">High Intent</p>
              <p className="mt-2 text-2xl font-semibold text-red-900">{highCount}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Intent Score</p>
              <p className="mt-2 text-2xl font-semibold text-amber-900">{data?.intentScore ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">Company source</p>
            <p className="mt-2 text-sm text-slate-600">
              Signal intelligence automatically refreshes from the company selected in the global account dropdown.
            </p>
            {isFetching ? <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">Refreshing...</p> : null}
          </div>
        </div>

        <div className="px-6 py-6">
          {!selectedCompany?.domain ? (
            <EmptyState
              icon="[]"
              heading="Select a company"
              subtext="Choose a company from the global account dropdown to load signals and account intelligence."
            />
          ) : isLoading ? (
            <SignalsSkeleton />
          ) : isError ? (
            <EmptyState
              icon="!"
              heading="Unable to load signal intelligence"
              subtext="The signal feed could not be fetched right now. Try again in a moment."
              action={{ label: "Retry", onClick: () => void refetch() }}
            />
          ) : !data || sortedSignals.length === 0 ? (
            <EmptyState
              icon="[]"
              heading="No signals found"
              subtext="Signal events and the account intelligence report will show up here once this company has tracked activity."
            />
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Buying Stage</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${
                          stageClassesByValue[data.buyingStage]
                        }`}
                      >
                        {stageLabelByValue[data.buyingStage]}
                      </span>
                      <span className="text-sm text-slate-600">
                        Based on {sortedSignals.length} recent signal{sortedSignals.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-red-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">High</p>
                      <p className="mt-2 text-xl font-semibold text-red-900">{highCount}</p>
                    </div>
                    <div className="rounded-lg border border-yellow-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">Medium</p>
                      <p className="mt-2 text-xl font-semibold text-yellow-900">{mediumCount}</p>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Low</p>
                      <p className="mt-2 text-xl font-semibold text-green-900">{lowCount}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-slate-400 via-amber-400 to-emerald-500"
                      style={{ width: `${getStageProgress(data.buyingStage)}%` }}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid-cols-5">
                    {stageOrder.map((stage) => (
                      <span key={stage} className="text-center">
                        {stageLabelByValue[stage]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {data.intelReport.recommendedOutreach ? (
                <div className="rounded-xl border border-brand-accent/20 bg-brand-light p-5 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-primary">
                    Recommended Outreach
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{data.intelReport.recommendedOutreach}</p>
                </div>
              ) : null}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-slate-900">Intent Signals</h4>
                      <p className="mt-1 text-sm text-slate-600">Timeline view of recent buying intent activity.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {sortedSignals.length} events
                    </span>
                  </div>

                  <div className="mt-6 space-y-5">
                    {sortedSignals.map((signal, index) => {
                      const intensity = getIntensity(signal);

                      return (
                        <div key={signal.signalId} className="grid grid-cols-[24px_minmax(0,1fr)] gap-4">
                          <div className="flex flex-col items-center">
                            <span
                              className={`mt-1 h-3 w-3 rounded-full ${
                                intensity === "HIGH"
                                  ? "bg-red-500"
                                  : intensity === "MEDIUM"
                                    ? "bg-yellow-500"
                                    : "bg-green-500"
                              }`}
                            />
                            {index < sortedSignals.length - 1 ? <span className="mt-2 h-full w-px bg-slate-200" /> : null}
                          </div>

                          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">
                                    {signalTypeLabelByValue[signal.type]}
                                  </span>
                                  <span
                                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                      intensityClassesByValue[intensity]
                                    }`}
                                  >
                                    {intensity}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-slate-700">{signal.summary}</p>
                              </div>

                              <div className="shrink-0 text-left lg:text-right">
                                <p className="text-sm font-medium text-slate-900">{formatDate(signal.observedAt)}</p>
                                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                                  Source: {signal.source}
                                </p>
                              </div>
                            </div>
                          </article>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900">Account Intelligence Report</h4>
                    <p className="mt-1 text-sm text-slate-600">Expandable sections for the context behind the signals.</p>
                  </div>

                  <div className="mt-6 space-y-3">
                    {reportSections.map((section) => {
                      const isOpen = openSection === section.key;
                      const items = data.intelReport[section.key];

                      return (
                        <div key={section.key} className="overflow-hidden rounded-xl border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setOpenSection(isOpen ? null : section.key)}
                            className="flex w-full items-center justify-between bg-slate-50 px-4 py-4 text-left transition hover:bg-slate-100"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                                {Array.isArray(items) ? items.length : 0} item{Array.isArray(items) && items.length === 1 ? "" : "s"}
                              </p>
                            </div>
                            <span className="text-lg text-slate-500">{isOpen ? "-" : "+"}</span>
                          </button>

                          {isOpen ? (
                            <div className="border-t border-slate-200 bg-white px-4 py-4">
                              {Array.isArray(items) && items.length > 0 ? (
                                <ul className="space-y-3">
                                  {items.map((item) => (
                                    <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-slate-500">No details available yet.</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
