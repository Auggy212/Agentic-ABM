import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SignalReport } from "./types";

export function useSignalsByAccount(domain: string | undefined) {
  return useQuery({
    queryKey: ["signals", "domain", domain],
    enabled: Boolean(domain),
    queryFn: async () => {
      const { data } = await api.get<SignalReport>("/api/signals", {
        params: { company: domain },
      });
      return data;
    },
  });
}

export function useSignalsByClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ["signals", "client", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data } = await api.get<Record<string, SignalReport>>("/api/signals", {
        params: { client_id: clientId },
      });
      return data;
    },
  });
}

export function useRegenerateIntel(domain: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data } = await api.post(`/api/signals/${domain}/regenerate-intel`, null, {
        params: { client_id: clientId },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signals", "domain", domain] });
    },
  });
}

export function useDiscoverSignals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data } = await api.post("/api/signals/discover", { client_id: clientId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signals"] });
    },
  });
}
