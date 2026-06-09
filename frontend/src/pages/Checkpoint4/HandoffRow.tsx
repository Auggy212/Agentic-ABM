import SLABadge from "./SLABadge";
import type { SalesHandoffNote } from "./types";

interface Props {
  handoff: SalesHandoffNote;
  selected: boolean;
  onSelect: (handoff: SalesHandoffNote) => void;
}

const STATUS_CHIP: Record<SalesHandoffNote["status"], string> = {
  PENDING: "bg-blue-50 text-blue-800 border-blue-200",
  ACCEPTED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  REJECTED: "bg-gray-100 text-gray-700 border-gray-200",
  ESCALATED: "bg-red-50 text-red-800 border-red-200",
};

export default function HandoffRow({ handoff, selected, onSelect }: Props) {
  return (
    <tr
      data-testid={`cp4-row-${handoff.handoff_id}`}
      onClick={() => onSelect(handoff)}
      className={`cursor-pointer border-b border-gray-100 ${selected ? "bg-blue-50/40" : "hover:bg-gray-50"}`}
    >
      <td className="px-3 py-2.5 text-sm font-medium text-gray-900">
        {handoff.account_domain}
      </td>
      <td className="px-3 py-2.5 text-sm text-gray-700">
        <span className="font-mono text-xs text-gray-500">{handoff.contact_id}</span>
      </td>
      <td className="px-3 py-2.5 text-sm font-semibold tabular-nums text-gray-900">
        {handoff.engagement_score}
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[handoff.status]}`}>
          {handoff.status}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <SLABadge notifySentAt={handoff.notify_sent_at} status={handoff.status} />
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500 tabular-nums">
        {new Date(handoff.created_at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </td>
    </tr>
  );
}
