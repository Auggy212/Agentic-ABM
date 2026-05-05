import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Btn from "@/components/ui/Btn";
import Modal from "@/components/ui/Modal";
import { getApiErrorMessage } from "./helpers";
import { useOperatorHalt } from "./hooks";

interface Props {
  clientId: string;
  open: boolean;
  onClose: () => void;
}

export default function HaltModal({ clientId, open, onClose }: Props) {
  const [detail, setDetail] = useState("");
  const [triggeredBy, setTriggeredBy] = useState("ops@sennen.io");
  const halt = useOperatorHalt(clientId);
  const errorMessage = halt.error ? getApiErrorMessage(halt.error, "Could not halt this campaign.") : null;
  const canSubmit = detail.trim().length > 0 && triggeredBy.trim().length > 0 && !halt.isPending;

  useEffect(() => {
    if (open) {
      setDetail("");
      setTriggeredBy("ops@sennen.io");
      halt.reset();
    }
  }, [open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    halt.mutate(
      { detail: detail.trim(), triggered_by: triggeredBy.trim() },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Halt campaign"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Btn type="button" variant="ghost" onClick={onClose} disabled={halt.isPending}>
            Cancel
          </Btn>
          <Btn form="campaign-halt-form" type="submit" variant="primary" loading={halt.isPending} disabled={!canSubmit}>
            Halt campaign
          </Btn>
        </div>
      }
    >
      <form id="campaign-halt-form" className="grid gap-4" onSubmit={submit}>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          New sends for this client will stop until an operator resumes with the RESUME confirmation.
        </div>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Halt detail
          <textarea
            className="min-h-[96px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-slate-900 focus:outline-none"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="Example: Client asked us to pause while legal reviews the sequence."
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Triggered by
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-normal text-slate-900 focus:border-slate-900 focus:outline-none"
            value={triggeredBy}
            onChange={(event) => setTriggeredBy(event.target.value)}
            placeholder="operator@example.com"
          />
        </label>
        {errorMessage ? <div role="alert" className="text-sm text-red-700">{errorMessage}</div> : null}
      </form>
    </Modal>
  );
}
