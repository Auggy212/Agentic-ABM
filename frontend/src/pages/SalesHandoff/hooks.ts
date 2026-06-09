import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SalesHandoffPublic } from "./types";

export function useSalesHandoff(token: string | undefined) {
  return useQuery({
    queryKey: ["sales-handoff", token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<SalesHandoffPublic>(`/api/sales/handoff/${token}`);
      return data;
    },
  });
}

export function useAcceptSalesHandoff(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (acceptedBy: string) => {
      const { data } = await api.post<SalesHandoffPublic>(
        `/api/sales/handoff/${token}/accept`,
        { accepted_by: acceptedBy },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-handoff", token] }),
  });
}

export function useRejectSalesHandoff(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data } = await api.post<SalesHandoffPublic>(
        `/api/sales/handoff/${token}/reject`,
        { rejection_reason: reason },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-handoff", token] }),
  });
}

// SLA countdown. Notify_sent_at + sla_hours = deadline. Returns:
//   { hoursRemaining, urgency } where urgency is 'fresh' | 'warn' | 'critical' | 'overdue'.
// Re-renders every 60s — granular enough for "23h 12m" -> "23h 11m" labels
// without hammering React or the DB (master prompt §5).
export interface SlaState {
  hoursRemaining: number;
  minutesRemaining: number;
  urgency: "fresh" | "warn" | "critical" | "overdue";
  deadline: Date | null;
}

export function useSlaCountdown(notifySentAt: string | null, slaHours: number): SlaState {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // tick is read so the linter doesn't strip it.
  void tick;

  if (!notifySentAt) {
    return { hoursRemaining: slaHours, minutesRemaining: slaHours * 60, urgency: "fresh", deadline: null };
  }
  const deadline = new Date(new Date(notifySentAt).getTime() + slaHours * 60 * 60 * 1000);
  const msRemaining = deadline.getTime() - Date.now();
  const hoursRemaining = msRemaining / (60 * 60 * 1000);
  const minutesRemaining = msRemaining / (60 * 1000);

  let urgency: SlaState["urgency"];
  if (msRemaining <= 0) urgency = "overdue";
  else if (hoursRemaining < 1) urgency = "critical";
  else if (hoursRemaining < 6) urgency = "warn";
  else urgency = "fresh";

  return { hoursRemaining, minutesRemaining, urgency, deadline };
}
