import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentsResponse } from "@/types/agents";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await api.get<AgentsResponse>("/api/agents");
      return data;
    },
    refetchInterval: 10_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    placeholderData: keepPreviousData, // keep showing old data while refetch/retry is in flight
    staleTime: 8_000,
  });
}
