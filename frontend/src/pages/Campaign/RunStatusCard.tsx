import type { CampaignRun } from "./types";

const STATUS_CHIP: Record<CampaignRun["status"], string> = {
  RUNNING: "bg-blue-50 text-blue-800 border-blue-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  HALTED: "bg-red-50 text-red-800 border-red-200",
  FAILED: "bg-red-100 text-red-900 border-red-300",
};

interface Props {
  run: CampaignRun;
}

export default function RunStatusCard({ run }: Props) {
  const startedAt = new Date(run.started_at).toLocaleString();
  const finishedAt = run.finished_at ? new Date(run.finished_at).toLocaleString() : null;

  return (
    <article
      data-testid={`campaign-run-${run.run_id}`}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">Latest run</div>
          <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{run.run_id}</div>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[run.status]}`}>
          {run.status}
        </span>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={run.total_messages} tone="default" />
        <Stat label="Sent" value={run.total_sent} tone="emerald" />
        <Stat label="Failed" value={run.total_failed} tone={run.total_failed > 0 ? "red" : "default"} />
        <Stat label="Pending" value={run.total_pending} tone={run.total_pending > 0 ? "amber" : "default"} />
      </dl>

      {run.quota_warnings.length > 0 ? (
        <div data-testid="run-quota-warnings" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong className="mb-1 block">Quota warnings ({run.quota_warnings.length})</strong>
          <ul className="space-y-0.5">
            {run.quota_warnings.map((warning, index) => (
              <li key={`${warning.source}-${index}`}>
                {warning.source}: {warning.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="mt-3 text-xs text-slate-500 tabular-nums">
        Started {startedAt}
        {finishedAt ? ` - Finished ${finishedAt}` : " - in progress"}
      </footer>
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "default" | "emerald" | "amber" | "red" }) {
  const cls =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "red"
          ? "text-red-700"
          : "text-slate-900";
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${cls}`}>{value}</dd>
    </div>
  );
}
