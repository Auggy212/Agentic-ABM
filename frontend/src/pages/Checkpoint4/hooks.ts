import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CP4QueuePayload, SalesHandoffNote } from "./types";
import { SLA_HOURS } from "./types";

const POLL_MS = 30_000; // master prompt §5

export function useCP4Queue(clientId: string | undefined) {
  return useQuery({
    queryKey: ["cp4-queue", clientId],
    enabled: Boolean(clientId),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev, // keepPreviousData equivalent in v5
    queryFn: async () => {
      const { data } = await api.get<CP4QueuePayload>(`/api/checkpoint-4`, {
        params: { client_id: clientId },
      });
      return data;
    },
  });
}

export function useNotifyHandoff(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (handoffId: string) => {
      const { data } = await api.post<SalesHandoffNote>(`/api/checkpoint-4/${handoffId}/notify`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cp4-queue", clientId] }),
  });
}

export function useAcceptHandoff(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { handoffId: string; acceptedBy: string }) => {
      const { data } = await api.post<SalesHandoffNote>(
        `/api/checkpoint-4/${vars.handoffId}/accept`,
        { accepted_by: vars.acceptedBy },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cp4-queue", clientId] }),
  });
}

export function useRejectHandoff(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { handoffId: string; reason: string; rejectedBy: string }) => {
      const { data } = await api.post<SalesHandoffNote>(
        `/api/checkpoint-4/${vars.handoffId}/reject`,
        { rejection_reason: vars.reason, rejected_by: vars.rejectedBy },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cp4-queue", clientId] }),
  });
}

export function useEscalateOverdue(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ escalated_count: number; handoffs: SalesHandoffNote[] }>(
        `/api/checkpoint-4/escalate-overdue`,
        { actor: "ops@sennen.io" },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cp4-queue", clientId] }),
  });
}

// SLA countdown — same shape as the external page's hook but local to keep
// internal/external surfaces from cross-importing (master prompt §1).
export type SlaUrgency = "fresh" | "warn" | "critical" | "overdue" | "unscheduled";

export interface SlaState {
  hoursRemaining: number;
  urgency: SlaUrgency;
  deadline: Date | null;
}

export function useSlaCountdown(notifySentAt: string | null, slaHours: number = SLA_HOURS): SlaState {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!notifySentAt) {
    return { hoursRemaining: slaHours, urgency: "unscheduled", deadline: null };
  }
  const deadline = new Date(new Date(notifySentAt).getTime() + slaHours * 60 * 60 * 1000);
  const msRemaining = deadline.getTime() - Date.now();
  const hoursRemaining = msRemaining / (60 * 60 * 1000);
  let urgency: SlaUrgency;
  if (msRemaining <= 0) urgency = "overdue";
  else if (hoursRemaining < 1) urgency = "critical";
  else if (hoursRemaining < 6) urgency = "warn";
  else urgency = "fresh";
  return { hoursRemaining, urgency, deadline };
}
