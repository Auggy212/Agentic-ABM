type PipelineStatus = "idle" | "running" | "complete" | "error" | "awaiting-review";

/**
 * Pipeline run-state badge with semantic labels and colored indicator dots.
 */
export interface StatusBadgeProps {
  status: PipelineStatus;
}

const statusConfig: Record<PipelineStatus, { dotClass: string; label: string }> = {
  idle: { dotClass: "bg-gray-400", label: "Not started" },
  running: { dotClass: "bg-blue-500 animate-pulse", label: "In progress" },
  complete: { dotClass: "bg-green-500", label: "Complete" },
  error: { dotClass: "bg-red-500", label: "Failed" },
  "awaiting-review": { dotClass: "bg-amber-500", label: "Awaiting review" }
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
      <span className={`h-2.5 w-2.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
