export interface StatusBadgeProps {
  type?: string;
  status: string;
}

const statusConfig: Record<string, { dotClass: string; label: string }> = {
  // Pipeline
  idle:              { dotClass: "bg-gray-400",               label: "Not started" },
  running:           { dotClass: "bg-blue-500 animate-pulse", label: "In progress" },
  complete:          { dotClass: "bg-green-500",              label: "Complete" },
  error:             { dotClass: "bg-red-500",                label: "Failed" },
  "awaiting-review": { dotClass: "bg-amber-500",              label: "Awaiting review" },
  // Email
  VALID:             { dotClass: "bg-green-500",              label: "Valid" },
  INVALID:           { dotClass: "bg-red-500",                label: "Invalid" },
  CATCH_ALL:         { dotClass: "bg-yellow-500",             label: "Catch-all" },
  UNKNOWN:           { dotClass: "bg-gray-400",               label: "Unknown" },
  // LinkedIn
  ACTIVE:            { dotClass: "bg-green-500",              label: "Active" },
  BROKEN:            { dotClass: "bg-red-500",                label: "Broken" },
  // Job title
  MATCH:             { dotClass: "bg-green-500",              label: "Match" },
  MISMATCH:          { dotClass: "bg-orange-400",             label: "Mismatch" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { dotClass: "bg-gray-300", label: status };
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
      <span className={`h-2.5 w-2.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
