import { useEffect, useState } from "react";

interface TypedConfirmationModalProps {
  open: boolean;
  title: string;
  /** Plain language describing what will happen. Renders in a tinted callout. */
  consequence: React.ReactNode;
  /**
   * The exact word the operator must type before the confirm button enables.
   * Case-sensitive — DO NOT lowercase or trim before comparison
   * (master prompt §7: the friction is the safety mechanism).
   */
  confirmationText: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional pending flag while the mutation is in flight. */
  isPending?: boolean;
  /** Optional error message rendered below the input. */
  errorMessage?: string | null;
  onConfirm: (typedValue: string) => void;
  onCancel: () => void;
}

/**
 * Generic typed-confirmation modal for irreversible high-stakes actions
 * (campaign RESUME, escalate-overdue sweep, account list deletion, bulk
 * regenerations). Submit is disabled until input matches `confirmationText`
 * EXACTLY — case-sensitive, no whitespace trimming.
 */
export default function TypedConfirmationModal({
  open,
  title,
  consequence,
  confirmationText,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isPending = false,
  errorMessage = null,
  onConfirm,
  onCancel,
}: TypedConfirmationModalProps) {
  const [value, setValue] = useState("");

  // Reset the input each time the modal opens — prevents the previous typed
  // value from auto-enabling the button on the next high-stakes action.
  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const matches = value === confirmationText;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button type="button" className="text-lg text-slate-500 hover:text-slate-700" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {consequence}
          </div>
          <label className="block text-sm text-gray-700">
            Type <span className="font-mono font-semibold text-gray-900">{confirmationText}</span> to confirm.
          </label>
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`Type ${confirmationText} to confirm`}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-gray-900 focus:outline-none"
            placeholder={confirmationText}
            autoComplete="off"
            spellCheck={false}
          />
          {errorMessage ? <div className="text-sm text-red-600">{errorMessage}</div> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(value)}
            disabled={!matches || isPending}
            data-testid="typed-confirm-button"
            className={
              !matches || isPending
                ? "rounded-lg bg-gray-300 px-4 py-2 text-sm font-semibold text-white cursor-not-allowed"
                : "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            }
          >
            {isPending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
