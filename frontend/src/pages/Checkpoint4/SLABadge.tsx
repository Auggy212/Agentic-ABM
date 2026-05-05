import { useSlaCountdown } from "./hooks";
import type { SalesHandoffNote } from "./types";

const STYLES = {
  fresh: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  critical: "bg-red-50 text-red-800 border-red-200",
  overdue: "bg-red-100 text-red-900 border-red-300",
  unscheduled: "bg-gray-100 text-gray-700 border-gray-200",
} as const;

interface Props {
  notifySentAt: string | null;
  slaHours?: number;
  /** Optional terminal state — overrides countdown rendering. */
  status?: SalesHandoffNote["status"];
}

function format(hours: number, urgency: ReturnType<typeof useSlaCountdown>["urgency"]): string {
  if (urgency === "unscheduled") return "Awaiting notify";
  if (urgency === "overdue") return "Overdue";
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m left`;
  return `${Math.floor(hours)}h left`;
}

export default function SLABadge({ notifySentAt, slaHours, status }: Props) {
  const sla = useSlaCountdown(notifySentAt, slaHours);
  if (status && status !== "PENDING") {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
        {status}
      </span>
    );
  }
  return (
    <span
      data-testid="cp4-sla-badge"
      data-urgency={sla.urgency}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLES[sla.urgency]}`}
    >
      {format(sla.hoursRemaining, sla.urgency)}
    </span>
  );
}
