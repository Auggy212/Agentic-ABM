import { useMemo, useState } from "react";
import { useUpdateContactMessageMutation } from "../api/api";

const reviewStatusTheme = {
  approved: "border-green-200 bg-green-50 text-green-700",
  pending: "border-yellow-300 bg-yellow-50 text-yellow-900",
  rejected: "border-red-200 bg-red-50 text-red-700"
};

const filterOptions = [
  { label: "All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" }
];

function normalizeMessages(messages) {
  return (messages ?? []).map((message, index) => ({
    id: message.id ?? `${message.channel ?? "message"}-${message.dayNumber ?? message.day ?? index}`,
    channel: message.channel ?? "email",
    subject: message.subject ?? "",
    body: message.body ?? message.text ?? message.note ?? "",
    cta: message.cta ?? "",
    day: message.dayNumber ?? message.day ?? index + 1,
    wordCount:
      message.wordCount ??
      message.word_count ??
      String(message.body ?? message.text ?? message.note ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    reviewStatus: message.reviewStatus ?? "pending"
  }));
}

export default function MessageReviewPanel({ contactId, messages = [], editor = { name: "Human Reviewer", email: "reviewer@example.com" } }) {
  const [filter, setFilter] = useState("all");
  const [draftMessages, setDraftMessages] = useState(() => normalizeMessages(messages));
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [draftBody, setDraftBody] = useState("");

  const updateMessageMutation = useUpdateContactMessageMutation({
    onSuccess: (_, variables) => {
      setDraftMessages((current) =>
        current.map((message) =>
          message.id === variables.messageId
            ? {
                ...message,
                body: variables.payload.body,
                subject: variables.payload.subject,
                cta: variables.payload.cta,
                wordCount: variables.payload.body.trim().split(/\s+/).filter(Boolean).length
              }
            : message
        )
      );
      setEditingMessageId(null);
      setDraftBody("");
    }
  });

  const visibleMessages = useMemo(() => {
    if (filter === "all") {
      return draftMessages;
    }

    return draftMessages.filter((message) => message.reviewStatus === filter);
  }, [draftMessages, filter]);

  const approvedCount = draftMessages.filter((message) => message.reviewStatus === "approved").length;

  function updateStatus(messageId, reviewStatus) {
    setDraftMessages((current) => current.map((message) => (message.id === messageId ? { ...message, reviewStatus } : message)));
  }

  function beginEdit(message) {
    setEditingMessageId(message.id);
    setDraftBody(message.body);
  }

  function bulkApprove() {
    setDraftMessages((current) => current.map((message) => ({ ...message, reviewStatus: "approved" })));
  }

  function saveEdit(message) {
    updateMessageMutation.mutate({
      contactId,
      messageId: message.id,
      payload: {
        channel: message.channel,
        subject: message.subject,
        body: draftBody,
        cta: message.cta,
        editor,
        notes: "Updated during message review."
      }
    });
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 shadow-sm">
        <p className="text-sm font-semibold text-yellow-900">Messages will be sent to real prospects. Review carefully.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-accent">Message Review Panel</p>
            <h3 className="mt-3 text-2xl font-semibold text-slate-900">Approve messaging before launch</h3>
            <p className="mt-2 text-sm text-slate-600">
              Review content, make fixes, and hold back anything that should not go live yet.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {approvedCount}/{draftMessages.length} approved
              </p>
            </div>

            <button
              type="button"
              onClick={bulkApprove}
              className="inline-flex items-center justify-center rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-blue-100"
            >
              Bulk Approve
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                filter === option.value ? "bg-brand-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {visibleMessages.map((message) => {
          const isEditing = editingMessageId === message.id;

          return (
            <article key={message.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase text-slate-700">
                    {String(message.channel).replace("_dm", "").replace("_", " ")}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    Day {message.day}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {message.wordCount} words
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${reviewStatusTheme[message.reviewStatus]}`}>
                    {message.reviewStatus}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateStatus(message.id, "approved")}
                    className="inline-flex items-center justify-center rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStatus(message.id, "rejected")}
                    className="inline-flex items-center justify-center rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => beginEdit(message)}
                    className="inline-flex items-center justify-center rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {message.subject ? <h4 className="mt-4 text-base font-semibold text-slate-900">{message.subject}</h4> : null}

              {isEditing ? (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={draftBody}
                    onChange={(event) => setDraftBody(event.target.value)}
                    rows={7}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(message)}
                      disabled={updateMessageMutation.isPending}
                      className="inline-flex items-center justify-center rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {updateMessageMutation.isPending ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMessageId(null);
                        setDraftBody("");
                      }}
                      className="inline-flex items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg bg-slate-50 px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.body}</p>
                  {message.cta ? <p className="mt-4 text-sm font-medium text-brand-primary">{message.cta}</p> : null}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
