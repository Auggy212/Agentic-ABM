import { useState, useMemo } from "react";
import { EngagementScore } from "../components/ui/EngagementScore";
import { EmptyState } from "../components/ui";
import { useAcceptLeadMutation } from "../api/api";
import { mockEnrichedLeads, type EnrichedLead } from "../mocks/salesLeads";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type HandoffStatus = "pending" | "accepted" | "rejected";

interface LocalStatus {
  status: HandoffStatus;
  note: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BADGE: Record<HandoffStatus, { label: string; cls: string }> = {
  pending: { label: "⏳ Pending", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  accepted: { label: "✅ Accepted", cls: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "❌ Rejected", cls: "bg-red-100 text-red-700 border-red-200" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation Modal
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmModal({
  lead,
  action,
  note,
  onNote,
  onConfirm,
  onCancel,
  isPending,
}: {
  lead: EnrichedLead;
  action: "accept" | "reject";
  note: string;
  onNote: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const isAccept = action === "accept";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full text-2xl ${isAccept ? "bg-green-100" : "bg-red-100"}`}>
          {isAccept ? "✅" : "❌"}
        </div>
        <h3 className="text-lg font-bold text-slate-900">
          {isAccept ? "Accept" : "Reject"} lead?
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          You are about to <strong>{isAccept ? "accept" : "reject"}</strong>{" "}
          <strong>{lead.fullName}</strong> from {lead.company}.
          {!isAccept && " This lead will be marked as rejected and removed from the active pipeline."}
        </p>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Sales note <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id={`note-${lead.contactId}`}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder={isAccept ? "Add context for the AE — e.g. timing, pain point to lead with…" : "Reason for rejection — e.g. budget mismatch, wrong persona…"}
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 resize-none"
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            id={`confirm-${action}-${lead.contactId}`}
            onClick={onConfirm}
            disabled={isPending}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-60 ${isAccept ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"}`}
          >
            {isPending ? "Saving…" : isAccept ? "Confirm Accept" : "Confirm Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast notification
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3 shadow-xl text-sm font-semibold text-white transition-all ${type === "success" ? "bg-green-600" : "bg-red-500"}`}>
      <span>{type === "success" ? "✅" : "❌"}</span>
      {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead acceptance card
// ─────────────────────────────────────────────────────────────────────────────

function AcceptanceCard({
  lead,
  localStatus,
  onAction,
}: {
  lead: EnrichedLead;
  localStatus: LocalStatus;
  onAction: (lead: EnrichedLead, action: "accept" | "reject") => void;
}) {
  const isHot = lead.engagementScore >= 60;
  const badge = BADGE[localStatus.status];
  const done = lead.status !== "new";

  return (
    <div className={`rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${isHot ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-accent text-sm font-bold text-white shadow">
              {lead.fullName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900">{lead.fullName}</p>
              <p className="truncate text-xs text-slate-500">{lead.title}</p>
              <p className="truncate text-xs font-medium text-brand-accent">{lead.company}</p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        {/* Score */}
        <div className="mt-4">
          <EngagementScore score={lead.engagementScore} size="md" showLabel animated />
        </div>

        {/* Qualification */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-700">Why this lead: </span>
          {lead.qualificationReason}
        </div>

        {/* Saved note */}
        {localStatus.note && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 italic">
            📝 "{localStatus.note}"
          </div>
        )}

        {/* Action buttons */}
        {localStatus.status === "pending" && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              id={`accept-btn-${lead.contactId}`}
              onClick={() => onAction(lead, "accept")}
              className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 hover:shadow-md active:scale-[0.98]"
            >
              ✅ Accept Lead
            </button>
            <button
              id={`reject-btn-${lead.contactId}`}
              onClick={() => onAction(lead, "reject")}
              className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 active:scale-[0.98]"
            >
              ❌ Reject Lead
            </button>
          </div>
        )}

        {localStatus.status !== "pending" && (
          <div className={`mt-4 rounded-xl p-3 text-center text-sm font-semibold ${localStatus.status === "accepted" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {localStatus.status === "accepted" ? "Lead accepted and passed to AE ✓" : "Lead rejected and removed from pipeline"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function SalesAcceptancePage() {
  const leads = mockEnrichedLeads;
  const [statuses, setStatuses] = useState<Record<string, LocalStatus>>(() =>
    Object.fromEntries(leads.map((l) => [l.contactId, { status: "pending" as HandoffStatus, note: "" }]))
  );
  const [modal, setModal] = useState<{ lead: EnrichedLead; action: "accept" | "reject" } | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const mutation = useAcceptLeadMutation({
    onSuccess: (_data: unknown, variables: { contactId: string; payload: { accepted: boolean } }) => {
      const action = variables.payload.accepted ? "accepted" : "rejected";
      setStatuses((prev) => ({
        ...prev,
        [variables.contactId]: { status: action as HandoffStatus, note: noteInput },
      }));
      showToast(`Lead ${action} successfully`, "success");
      setModal(null);
    },
    onError: () => showToast("Action failed — please try again", "error"),
  });

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function handleAction(lead: EnrichedLead, action: "accept" | "reject") {
    setNoteInput("");
    setModal({ lead, action });
  }

  function handleConfirm() {
    if (!modal) return;
    // Optimistic update
    setStatuses((prev) => ({
      ...prev,
      [modal.lead.contactId]: {
        status: modal.action === "accept" ? "accepted" : "rejected",
        note: noteInput,
      },
    }));
    setModal(null);
    showToast(`Lead ${modal.action === "accept" ? "accepted" : "rejected"} successfully`, "success");

    // Real API call (will work when backend is ready)
    mutation.mutate({
      contactId: modal.lead.contactId,
      payload: {
        accepted: modal.action === "accept",
        salesExec: { name: "Sales Executive", email: "sales@agentic.ai" },
        note: noteInput,
      },
    });
  }

  const filterKey = useState<"all" | "pending" | "accepted" | "rejected">("all");
  const [filter, setFilter] = filterKey;

  const filtered = useMemo(() => {
    if (filter === "all") return leads;
    return leads.filter((l) => statuses[l.contactId]?.status === filter);
  }, [leads, statuses, filter]);

  const counts = useMemo(() => ({
    pending: leads.filter((l) => statuses[l.contactId]?.status === "pending").length,
    accepted: leads.filter((l) => statuses[l.contactId]?.status === "accepted").length,
    rejected: leads.filter((l) => statuses[l.contactId]?.status === "rejected").length,
  }), [leads, statuses]);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-accent">Sales Operations</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Sales Acceptance</h2>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Review qualified leads and accept or reject them with optional notes. Accepted leads are immediately handed off to the AE.
        </p>

        {/* Summary chips */}
        <div className="mt-4 flex flex-wrap gap-3">
          {([
            ["all", "All Leads", leads.length, "bg-slate-100 text-slate-700"],
            ["pending", "Pending", counts.pending, "bg-amber-100 text-amber-700"],
            ["accepted", "Accepted", counts.accepted, "bg-green-100 text-green-700"],
            ["rejected", "Rejected", counts.rejected, "bg-red-100 text-red-700"],
          ] as const).map(([key, label, count, cls]) => (
            <button
              key={key}
              id={`filter-${key}`}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${cls} ${filter === key ? "ring-2 ring-offset-1 ring-brand-accent" : "opacity-70 hover:opacity-100"}`}
            >
              {label}
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState icon="📭" heading="No leads in this category" subtext="Switch the filter above to see other leads." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lead) => (
            <AcceptanceCard
              key={lead.contactId}
              lead={lead}
              localStatus={statuses[lead.contactId] ?? { status: "pending", note: "" }}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* Confirmation modal */}
      {modal && (
        <ConfirmModal
          lead={modal.lead}
          action={modal.action}
          note={noteInput}
          onNote={setNoteInput}
          onConfirm={handleConfirm}
          onCancel={() => setModal(null)}
          isPending={mutation.isPending}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </section>
  );
}
