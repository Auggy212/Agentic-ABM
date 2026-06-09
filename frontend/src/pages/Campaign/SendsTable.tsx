import { useMemo, useState } from "react";
import type { OutboundSend, SendStatus } from "./types";

const STATUS_CHIP: Record<SendStatus, string> = {
  QUEUED: "bg-blue-50 text-blue-800 border-blue-200",
  SENT: "bg-emerald-50 text-emerald-800 border-emerald-200",
  FAILED: "bg-red-50 text-red-800 border-red-200",
  PENDING_QUOTA_RESET: "bg-amber-50 text-amber-900 border-amber-200",
  PENDING_COOKIE_REFRESH: "bg-amber-50 text-amber-900 border-amber-200",
  PENDING_BUDGET: "bg-amber-50 text-amber-900 border-amber-200",
  HALTED: "bg-red-100 text-red-900 border-red-300",
};

const PAGE_SIZE = 25;
const FILTERS = ["ALL", "SENT", "FAILED", "PENDING_QUOTA_RESET", "HALTED"] as const;

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

interface Props {
  sends: OutboundSend[];
}

export default function SendsTable({ sends }: Props) {
  const [filter, setFilter] = useState<"ALL" | SendStatus>("ALL");
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    if (filter === "ALL") return sends;
    return sends.filter((send) => send.status === filter);
  }, [sends, filter]);

  const paged = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Outbound sends</h3>
          <p className="text-xs text-slate-500">
            {visible.length} {filter === "ALL" ? "total" : formatStatusLabel(filter.toLowerCase())} - refreshes every 30s
          </p>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Filter outbound sends">
          {FILTERS.map((nextFilter) => (
            <button
              key={nextFilter}
              type="button"
              onClick={() => {
                setFilter(nextFilter);
                setPage(0);
              }}
              data-testid={`sends-filter-${nextFilter.toLowerCase()}`}
              className={
                filter === nextFilter
                  ? "rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold text-white"
                  : "rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              }
            >
              {formatStatusLabel(nextFilter)}
            </button>
          ))}
        </div>
      </header>

      <div className="overflow-x-auto">
        {paged.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">No sends in this view.</div>
        ) : (
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Transport</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Attempted</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((send) => (
                <tr key={send.send_id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{send.account_domain}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{send.channel}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{send.transport}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[send.status]}`}>
                      {formatStatusLabel(send.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">
                    {new Date(send.attempted_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 font-mono text-xs text-red-700" title={send.error_message ?? send.error_code ?? ""}>
                    {send.error_code ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 ? (
        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
              disabled={page === 0}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((currentPage) => Math.min(totalPages - 1, currentPage + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
