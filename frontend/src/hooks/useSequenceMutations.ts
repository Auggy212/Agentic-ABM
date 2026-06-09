import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Toggle a sequence between "active" and "paused" */
export function usePatchSequenceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, status }: { domain: string; status: "active" | "paused" }) =>
      api.patch(`/api/sequences/${encodeURIComponent(domain)}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sequences"] }),
  });
}

/** Edit a single step's body (and optionally subject) */
export function usePatchStepBody() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      body,
      subject,
    }: {
      messageId: string;
      body: string;
      subject?: string;
    }) => api.patch(`/api/sequences/steps/${messageId}`, { body, subject }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sequences"] }),
  });
}
