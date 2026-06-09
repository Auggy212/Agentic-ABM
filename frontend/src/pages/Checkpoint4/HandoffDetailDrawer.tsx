import { useState } from "react";
import { useAcceptHandoff, useNotifyHandoff, useRejectHandoff } from "./hooks";
import SLABadge from "./SLABadge";
import type { SalesHandoffNote } from "./types";

interface Props {
  handoff: SalesHandoffNote;
  clientId: string;
  onClose: () => void;
}

function formatEventType(eventType: string) {
  return eventType.replace(/_/g, " ");
}

export default function HandoffDetailDrawer({ handoff, clientId, onClose }: Props) {
  const accept = useAcceptHandoff(clientId);
  const reject = useRejectHandoff(clientId);
  const notify = useNotifyHandoff(clientId);
  const [acceptedBy, setAcceptedBy] = useState("ops@sennen.io");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"none" | "accept" | "reject">("none");

  const canNotify = handoff.status === "PENDING" && !handoff.notify_sent_at;
  const canDecide = handoff.status === "PENDING" && Boolean(handoff.notify_sent_at);

  return (
    <aside
      role="complementary"
      aria-label="Handoff detail"
      className="fixed right-0 top-0 z-30 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl"
    >
      <header className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Handoff detail</div>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{handoff.account_domain}</h2>
          <div className="mt-1 flex items-center gap-2">
            <SLABadge notifySentAt={handoff.notify_sent_at} status={handoff.status} />
            <span className="text-xs font-mono text-gray-500">score {handoff.engagement_score}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail"
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">TL;DR</h3>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 font-sans">
            {handoff.tldr_text}
          </pre>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Triggering events</h3>
          <ul className="mt-2 space-y-1.5">
            {handoff.triggering_events.map((evt, idx) => (
              <li key={idx} className="flex justify-between text-sm">
                <span className="text-gray-800">{formatEventType(evt.event_type)}</span>
                <span className="font-mono text-gray-500 tabular-nums">
                  +{evt.score_delta} · {new Date(evt.occurred_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit</h3>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-gray-700">
            <dt className="text-gray-500">Created</dt>
            <dd className="tabular-nums">{new Date(handoff.created_at).toLocaleString()}</dd>
            <dt className="text-gray-500">Notified</dt>
            <dd className="tabular-nums">{handoff.notify_sent_at ? new Date(handoff.notify_sent_at).toLocaleString() : "—"}</dd>
            {handoff.accepted_at ? (
              <>
                <dt className="text-gray-500">Accepted</dt>
                <dd className="tabular-nums">{new Date(handoff.accepted_at).toLocaleString()} · {handoff.accepted_by}</dd>
              </>
            ) : null}
            {handoff.rejected_at ? (
              <>
                <dt className="text-gray-500">Rejected</dt>
                <dd className="tabular-nums">{new Date(handoff.rejected_at).toLocaleString()}</dd>
                <dt className="text-gray-500">Reason</dt>
                <dd className="col-span-1 text-gray-800">{handoff.rejection_reason}</dd>
              </>
            ) : null}
            {handoff.escalated_at ? (
              <>
                <dt className="text-gray-500">Escalated</dt>
                <dd className="tabular-nums">{new Date(handoff.escalated_at).toLocaleString()}</dd>
                <dt className="text-gray-500">Reason</dt>
                <dd className="col-span-1 text-gray-800">{handoff.escalation_reason}</dd>
              </>
            ) : null}
          </dl>
        </section>

        {mode === "accept" ? (
          <section className="rounded-lg border border-gray-200 p-3">
            <label className="block text-xs font-semibold text-gray-700">Accepted by</label>
            <input
              value={acceptedBy}
              onChange={(e) => setAcceptedBy(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setMode("none")} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm">Cancel</button>
              <button
                onClick={() =>
                  accept.mutate(
                    { handoffId: handoff.handoff_id, acceptedBy },
                    { onSuccess: () => setMode("none") },
                  )
                }
                disabled={accept.isPending || !acceptedBy.trim()}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-300"
              >
                {accept.isPending ? "Accepting…" : "Confirm accept"}
              </button>
            </div>
          </section>
        ) : null}

        {mode === "reject" ? (
          <section className="rounded-lg border border-gray-200 p-3">
            <label className="block text-xs font-semibold text-gray-700">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setMode("none")} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm">Cancel</button>
              <button
                onClick={() =>
                  reject.mutate(
                    { handoffId: handoff.handoff_id, reason: reason.trim(), rejectedBy: "ops@sennen.io" },
                    { onSuccess: () => setMode("none") },
                  )
                }
                disabled={reject.isPending || reason.trim().length < 5}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
              >
                {reject.isPending ? "Rejecting…" : "Confirm reject"}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <footer className="border-t border-gray-200 px-5 py-3 flex items-center justify-end gap-2">
        {canNotify ? (
          <button
            onClick={() => notify.mutate(handoff.handoff_id)}
            disabled={notify.isPending}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {notify.isPending ? "Notifying…" : "Send notify"}
          </button>
        ) : null}
        <button
          onClick={() => setMode("reject")}
          disabled={!canDecide}
          title={!canDecide ? "Notify must be sent before reject" : undefined}
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          Reject
        </button>
        <button
          onClick={() => setMode("accept")}
          disabled={!canDecide}
          title={!canDecide ? "Notify must be sent before accept" : undefined}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-300"
        >
          Accept
        </button>
      </footer>
    </aside>
  );
}
