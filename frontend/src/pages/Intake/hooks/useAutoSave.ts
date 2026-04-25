import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { saveDraft } from "@/lib/api";
import { useIntakeStore } from "@/store/intakeStore";

const INTERVAL_MS = 5_000;

export function useAutoSave() {
  const { clientId, formData, isDirty, markSaved } = useIntakeStore();
  const isDirtyRef = useRef(isDirty);

  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  const mutation = useMutation({
    mutationFn: () => saveDraft(clientId, formData as unknown as Record<string, unknown>),
    onSuccess: () => markSaved(),
  });

  useEffect(() => {
    const id = setInterval(() => {
      if (isDirtyRef.current) {
        mutation.mutate();
      }
    }, INTERVAL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return {
    isSaving: mutation.isPending,
    lastSaved: useIntakeStore.getState().lastSaved,
    saveNow: () => mutation.mutate(),
  };
}
