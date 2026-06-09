import Btn from "@/components/ui/Btn";
import { getApiErrorMessage } from "./helpers";
import { useTriggerRun } from "./hooks";

interface Props {
  clientId: string;
  disabled?: boolean;
  disabledReason?: string;
}

export default function RunCampaignButton({ clientId, disabled = false, disabledReason }: Props) {
  const triggerRun = useTriggerRun(clientId);
  const errorMessage = triggerRun.error
    ? getApiErrorMessage(triggerRun.error, "Campaign run could not be queued.")
    : null;

  return (
    <div className="grid justify-items-end gap-1">
      <Btn
        type="button"
        variant="primary"
        icon="play"
        loading={triggerRun.isPending}
        disabled={disabled}
        onClick={() => triggerRun.mutate()}
        aria-label="Run campaign"
        title={disabledReason}
      >
        {triggerRun.isPending ? "Queuing" : "Run campaign"}
      </Btn>
      {disabled && disabledReason ? (
        <span className="max-w-[260px] text-right text-xs text-slate-500">{disabledReason}</span>
      ) : null}
      {triggerRun.isSuccess ? (
        <span className="text-xs font-medium text-emerald-700">Run queued.</span>
      ) : null}
      {errorMessage ? (
        <span role="alert" className="max-w-[320px] text-right text-xs text-red-700">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
