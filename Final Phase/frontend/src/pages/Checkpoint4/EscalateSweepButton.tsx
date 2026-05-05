import { useState } from "react";
import TypedConfirmationModal from "@/components/ui/TypedConfirmationModal";
import { useEscalateOverdue } from "./hooks";

interface Props {
  clientId: string;
  overdueCount: number;
}

export default function EscalateSweepButton({ clientId, overdueCount }: Props) {
  const [open, setOpen] = useState(false);
  const escalate = useEscalateOverdue(clientId);

  const disabled = overdueCount === 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "No overdue handoffs to escalate" : undefined}
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
      >
        Escalate overdue ({overdueCount})
      </button>
      <TypedConfirmationModal
        open={open}
        title="Escalate all overdue handoffs?"
        confirmationText="ESCALATE"
        confirmLabel="Escalate now"
        consequence={
          <>
            This will flip <strong>{overdueCount}</strong> overdue handoff
            {overdueCount === 1 ? "" : "s"} from <strong>PENDING</strong> to <strong>ESCALATED</strong>.
            The Sales Exec can no longer accept these — they return to the Operator queue.
            This action is logged in the audit trail.
          </>
        }
        isPending={escalate.isPending}
        errorMessage={escalate.error ? "Escalation failed — please try again." : null}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          escalate.mutate(undefined, { onSuccess: () => setOpen(false) });
        }}
      />
    </>
  );
}
