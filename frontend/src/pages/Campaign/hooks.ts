import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ActiveHaltsResponse,
  CampaignHalt,
  CampaignRunResponse,
  EngagementFeedResponse,
  HaltReason,
  OutboundSendsResponse,
  TriggerRunResponse,
} from "./types";

const POLL_MS = 30_000;

function invalidateCampaignQueries(qc: ReturnType<typeof useQueryClient>, clientId?: string) {
  qc.invalidateQueries({ queryKey: ["campaign-runs", clientId] });
  qc.invalidateQueries({ queryKey: ["campaign-sends", clientId] });
  qc.invalidateQueries({ queryKey: ["campaign-engagement-feed", clientId] });
  qc.invalidateQueries({ queryKey: ["campaign-halts", clientId] });
  qc.invalidateQueries({ queryKey: ["quota-panel"] });
}

export function useCampaignRuns(clientId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-runs", clientId],
    enabled: Boolean(clientId),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await api.get<CampaignRunResponse>("/api/campaign/runs", {
        params: { client_id: clientId },
      });
      return data;
    },
  });
}

export function useOutboundSends(clientId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-sends", clientId],
    enabled: Boolean(clientId),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await api.get<OutboundSendsResponse>("/api/campaign/sends", {
        params: { client_id: clientId },
      });
      return data;
    },
  });
}

export function useEngagementFeed(clientId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-engagement-feed", clientId],
    enabled: Boolean(clientId),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await api.get<EngagementFeedResponse>("/api/campaign/engagement-feed", {
        params: { client_id: clientId },
      });
      return data;
    },
  });
}

export function useActiveHalts(clientId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-halts", clientId],
    enabled: Boolean(clientId),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await api.get<ActiveHaltsResponse>("/api/campaign/halts");
      return {
        halts: data.halts.filter((halt) => halt.scope === "GLOBAL" || halt.client_id === clientId),
      };
    },
  });
}

export function useTriggerRun(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<TriggerRunResponse>(`/api/campaign/run`, undefined, {
        params: { client_id: clientId },
      });
      return data;
    },
    onSuccess: () => {
      invalidateCampaignQueries(qc, clientId);
    },
  });
}

export function useOperatorHalt(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { detail: string; triggered_by: string; reason?: HaltReason }) => {
      const { data } = await api.post<CampaignHalt>(
        `/api/campaign/halt`,
        {
          reason: vars.reason ?? "OPERATOR_REQUESTED",
          detail: vars.detail,
          triggered_by: vars.triggered_by,
        },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: () => invalidateCampaignQueries(qc, clientId),
  });
}

export function useResume(clientId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { halt_id: string; confirmation: string; resumed_by: string }) => {
      const { data } = await api.post<CampaignHalt>(`/api/campaign/resume`, vars);
      return data;
    },
    onSuccess: () => invalidateCampaignQueries(qc, clientId),
  });
}
