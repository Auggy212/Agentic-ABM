import { useEffect, useId, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

const REASONS = [
  "Not true ICP fit",
  "Wrong industry sub-segment",
  "Out of geography",
  "Acquired/Defunct",
  "Other",
] as const;

interface RemoveAccountModalProps {
  open: boolean;
  accountCount: number;
  accountLabel: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export default function RemoveAccountModal({
  open,
  accountCount,
  accountLabel,
  loading,
  onClose,
  onConfirm,
}: RemoveAccountModalProps) {
  const selectId = useId();
  const notesId = useId();
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const needsOtherReason = reason === "Other";
  const resolvedReason = needsOtherReason ? otherReason.trim() : reason;
  const canSubmit = resolvedReason.length > 0;

  useEffect(() => {
    if (!open) {
      setReason("");
      setOtherReason("");
    }
  }, [open]);

  async function handleConfirm() {
    if (!canSubmit) {
      return;
    }
    await onConfirm(resolvedReason);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Remove ${accountCount > 1 ? `${accountCount} accounts` : accountLabel}`}
      footer={(
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={!canSubmit} loading={loading}>
            Remove from list
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Removed accounts are audit-logged before Phase 2 begins. A reason is required so the team
          can trace why this checkpoint changed the list.
        </p>

        <div>
          <label htmlFor={selectId} className="form-label">
            Reason for removal
          </label>
          <select
            id={selectId}
            className="form-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="">Select a reason</option>
            {REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {needsOtherReason && (
          <div>
            <label htmlFor={notesId} className="form-label">
              Add context
            </label>
            <textarea
              id={notesId}
              rows={4}
              className="form-textarea"
              placeholder="Tell the team why this account should be removed."
              value={otherReason}
              onChange={(event) => setOtherReason(event.target.value)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
