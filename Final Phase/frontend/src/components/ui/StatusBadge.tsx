export type EmailStatus = "VALID" | "INVALID" | "CATCH_ALL" | "UNKNOWN";
export type LinkedInStatus = "ACTIVE" | "BROKEN" | "UNKNOWN";
export type TitleMatchStatus = "MATCH" | "MISMATCH" | "UNKNOWN";
export type StatusBadgeType = "Email Status" | "LinkedIn Status" | "Title Match";

export type StatusBadgeProps =
  | { type: "Email Status"; status: EmailStatus }
  | { type: "LinkedIn Status"; status: LinkedInStatus }
  | { type: "Title Match"; status: TitleMatchStatus };

const statusClasses: Record<EmailStatus | LinkedInStatus | TitleMatchStatus, string> = {
  VALID: "border-green-200 bg-green-50 text-green-700",
  INVALID: "border-red-200 bg-red-50 text-red-700",
  CATCH_ALL: "border-yellow-200 bg-yellow-50 text-yellow-800",
  UNKNOWN: "border-slate-200 bg-slate-100 text-slate-600",
  ACTIVE: "border-green-200 bg-green-50 text-green-700",
  BROKEN: "border-red-200 bg-red-50 text-red-700",
  MATCH: "border-green-200 bg-green-50 text-green-700",
  MISMATCH: "border-red-200 bg-red-50 text-red-700"
};

const typeStatuses: Record<StatusBadgeType, readonly string[]> = {
  "Email Status": ["VALID", "INVALID", "CATCH_ALL", "UNKNOWN"],
  "LinkedIn Status": ["ACTIVE", "BROKEN", "UNKNOWN"],
  "Title Match": ["MATCH", "MISMATCH", "UNKNOWN"]
};

function formatLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const fallbackStatus = typeStatuses[type].includes(status) ? status : "UNKNOWN";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusClasses[fallbackStatus]}`}
    >
      {formatLabel(fallbackStatus)}
    </span>
  );
}
