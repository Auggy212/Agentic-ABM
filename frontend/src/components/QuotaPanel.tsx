import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface QuotaItem {
  source: string;
  window: string;
  used: number;
  limit: number;
  remaining: number;
  exhausted: boolean;
  window_kind: "monthly" | "daily";
}

interface QuotaResponse {
  quotas: QuotaItem[];
}

const POLL_MS = 30_000; // master prompt §5

function tone(used: number, limit: number): { bg: string; bar: string; label: string } {
  if (limit <= 0) return { bg: "bg-gray-100", bar: "bg-gray-400", label: "—" };
  const pct = used / limit;
  if (pct >= 0.9) return { bg: "bg-red-100", bar: "bg-red-600", label: "critical" };
  if (pct >= 0.7) return { bg: "bg-amber-100", bar: "bg-amber-500", label: "warn" };
  return { bg: "bg-emerald-100", bar: "bg-emerald-500", label: "ok" };
}

interface Props {
  /** Override the default endpoint. Defaults to the Phase 5 campaign quota route. */
  endpoint?: string;
  /** Compact mode: smaller text, no header — for embedding in other panels. */
  compact?: boolean;
}

/**
 * QuotaPanel — first-class operational early-warning surface (master prompt §6).
 * Polls the configured endpoint every 30s and renders a progress bar per source:
 *  - green   <70%
 *  - amber   70–90%
 *  - red     >=90%  (with a tooltip listing the reset window)
 *
 * Reused on /campaigns and (optionally) /pipeline.
 */
export default function QuotaPanel({ endpoint = "/api/campaign/quota-status", compact = false }: Props) {
  const query = useQuery({
    queryKey: ["quota-panel", endpoint],
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await api.get<QuotaResponse>(endpoint);
      return data;
    },
  });

  const items = query.data?.quotas ?? [];

  return (
    <section
      data-testid="quota-panel"
      className={
        compact
          ? "rounded-md border border-slate-200 bg-white p-3"
          : "rounded-lg border border-slate-200 bg-white p-4"
      }
    >
      {compact ? null : (
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Quota status</h3>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">refreshes every 30s</span>
        </header>
      )}

      {query.isLoading ? (
        <div className="text-sm text-slate-500">Loading quotas…</div>
      ) : query.isError ? (
        <div className="text-sm text-red-600">Quota status unavailable.</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500">No quotas tracked.</div>
      ) : (
        <ul className="grid gap-2">
          {items.map((q) => {
            const t = tone(q.used, q.limit);
            const pct = q.limit > 0 ? Math.min(100, (q.used / q.limit) * 100) : 0;
            return (
              <li
                key={q.source}
                data-testid={`quota-row-${q.source}`}
                data-tone={t.label}
                className="grid grid-cols-[110px_1fr_auto] items-center gap-3"
              >
                <span className="text-xs font-semibold text-slate-700 truncate" title={q.source}>
                  {q.source}
                </span>
                <div
                  className={`relative h-2 overflow-hidden rounded-full ${t.bg}`}
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${q.source} quota`}
                >
                  <div className={`absolute inset-y-0 left-0 ${t.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <span
                  className="text-[11px] font-mono tabular-nums text-slate-600"
                  title={
                    q.exhausted
                      ? `Resets ${q.window_kind === "monthly" ? "next month" : "tomorrow"} (window=${q.window}). Pause sends or switch source.`
                      : `Window ${q.window}`
                  }
                >
                  {q.used}/{q.limit}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
