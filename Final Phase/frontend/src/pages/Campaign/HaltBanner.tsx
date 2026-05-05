import { useState } from "react";
import Btn from "@/components/ui/Btn";
import TypedConfirmationModal from "@/components/ui/TypedConfirmationModal";
import { formatDateTime, getApiErrorMessage } from "./helpers";
import { useResume } from "./hooks";
import type { CampaignHalt } from "./types";

interface Props {
  clientId: string;
  halt: CampaignHalt;
}

export default function HaltBanner({ clientId, halt }: Props) {
  const [resumeOpen, setResumeOpen] = useState(false);
  const resume = useResume(clientId);
  const errorMessage = resume.error ? getApiErrorMessage(resume.error, "Could not resume this campaign.") : null;
  const scopeLabel = halt.scope === "GLOBAL" ? "Global halt" : "Client halt";

  return (
    <>
      <section
        data-testid="campaign-halt-banner"
        className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-950"
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-red-700">{scopeLabel}</div>
          <h2 className="mt-1 text-base font-semibold">Campaign sends are halted</h2>
          <p className="mt-1 text-sm text-red-900">{halt.detail}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-red-800">
            <span>reason={halt.reason}</span>
            <span>by={halt.triggered_by}</span>
            <span>at={formatDateTime(halt.triggered_at)}</span>
          </div>
          {errorMessage ? <div role="alert" className="mt-2 text-sm font-medium text-red-800">{errorMessage}</div> : null}
        </div>
        <Btn type="button" variant="primary" onClick={() => setResumeOpen(true)} loading={resume.isPending}>
          Resume
        </Btn>
      </section>

      <TypedConfirmationModal
        open={resumeOpen}
        title="Resume campaign?"
        consequence={
          <span>
            Resuming clears halt <span className="font-mono">{halt.halt_id}</span> and allows campaign sends for this client to continue.
          </span>
        }
        confirmationText="RESUME"
        confirmLabel="Resume campaign"
        isPending={resume.isPending}
        errorMessage={errorMessage}
        onCancel={() => setResumeOpen(false)}
        onConfirm={(confirmation) => {
          resume.mutate(
            { halt_id: halt.halt_id, confirmation, resumed_by: "ops@sennen.io" },
            { onSuccess: () => setResumeOpen(false) },
          );
        }}
      />
    </>
  );
}
