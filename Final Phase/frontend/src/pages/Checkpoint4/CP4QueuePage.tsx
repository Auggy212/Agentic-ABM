import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCopilotSelection } from "@/store/copilotSelectionStore";
import EscalateSweepButton from "./EscalateSweepButton";
import HandoffDetailDrawer from "./HandoffDetailDrawer";
import HandoffRow from "./HandoffRow";
import { useCP4Queue } from "./hooks";
import type { CP4Status, SalesHandoffNote } from "./types";

const DEFAULT_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

const FILTERS: { value: "ALL" | CP4Status; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ESCALATED", label: "Escalated" },
];

export default function CP4QueuePage() {
  const [search] = useSearchParams();
  const clientId = search.get("client_id") || DEFAULT_CLIENT_ID;
  const queue = useCP4Queue(clientId);
  const [filter, setFilter] = useState<"ALL" | CP4Status>("ALL");
  const [selected, setSelected] = useState<SalesHandoffNote | null>(null);

  // Push the selected handoff into the global selection store so the Copilot
  // sees it on the next /api/copilot/message POST. Cleared on unmount.
  const setCopilotSelection = useCopilotSelection((s) => s.setSelection);
  const clearCopilotSelection = useCopilotSelection((s) => s.clear);
  useEffect(() => {
    if (selected) setCopilotSelection("handoff", [selected.handoff_id]);
    else setCopilotSelection(null, []);
  }, [selected, setCopilotSelection]);
  useEffect(() => () => clearCopilotSelection(), [clearCopilotSelection]);

  const visibleHandoffs = useMemo(() => {
    if (!queue.data) return [] as SalesHandoffNote[];
    if (filter === "ALL") return queue.data.handoffs;
    return queue.data.handoffs.filter((h) => h.status === filter);
  }, [queue.data, filter]);

  // Refresh selected from latest data so the drawer reflects mutations.
  const selectedHydrated = useMemo(() => {
    if (!selected || !queue.data) return selected;
    return queue.data.handoffs.find((h) => h.handoff_id === selected.handoff_id) ?? null;
  }, [selected, queue.data]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Checkpoint 4 — Sales Handoff Queue</h1>
          <p className="mt-1 text-sm text-slate-600">
            Warmed leads awaiting Sales Exec acceptance. The 24h SLA starts when the Sales Exec is notified.
          </p>
        </div>
        {queue.data ? (
          <EscalateSweepButton clientId={clientId} overdueCount={queue.data.summary.overdue_pending} />
        ) : null}
      </header>

      {/* Summary tiles */}
      {queue.data ? (
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 px-5 py-4 sm:grid-cols-6">
          {[
            { label: "Total", value: queue.data.summary.total, tone: "default" as const },
            { label: "Pending", value: queue.data.summary.pending, tone: "blue" as const },
            { label: "Accepted", value: queue.data.summary.accepted, tone: "emerald" as const },
            { label: "Rejected", value: queue.data.summary.rejected, tone: "gray" as const },
            { label: "Escalated", value: queue.data.summary.escalated, tone: "red" as const },
            { label: "Overdue", value: queue.data.summary.overdue_pending, tone: queue.data.summary.overdue_pending > 0 ? "red" as const : "default" as const },
          ].map((tile) => (
            <div key={tile.label} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">{tile.label}</div>
              <div
                data-testid={`cp4-tile-${tile.label.toLowerCase()}`}
                className={
                  tile.tone === "red"
                    ? "text-xl font-semibold text-red-700 tabular-nums"
                    : tile.tone === "blue"
                    ? "text-xl font-semibold text-blue-700 tabular-nums"
                    : tile.tone === "emerald"
                    ? "text-xl font-semibold text-emerald-700 tabular-nums"
                    : tile.tone === "gray"
                    ? "text-xl font-semibold text-slate-700 tabular-nums"
                    : "text-xl font-semibold text-slate-900 tabular-nums"
                }
              >
                {tile.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            data-testid={`cp4-filter-${f.value.toLowerCase()}`}
            className={
              filter === f.value
                ? "rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {queue.isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Loading handoffs…</div>
        ) : queue.isError ? (
          <div className="px-5 py-12 text-center text-sm text-red-600">Could not load CP4 queue. Retry shortly.</div>
        ) : visibleHandoffs.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            {filter === "ALL"
              ? "No handoffs yet. The Campaign agent will create these as engagement crosses the threshold."
              : `No handoffs in ${filter} state.`}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">SLA</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {visibleHandoffs.map((h) => (
                <HandoffRow
                  key={h.handoff_id}
                  handoff={h}
                  selected={selected?.handoff_id === h.handoff_id}
                  onSelect={setSelected}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedHydrated ? (
        <HandoffDetailDrawer
          handoff={selectedHydrated}
          clientId={clientId}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}
