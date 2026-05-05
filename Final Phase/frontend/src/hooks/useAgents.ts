import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentsResponse } from "@/types/agents";
import { mockAgents } from "@/mocks/agents";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async (): Promise<AgentsResponse> => {
      try {
        const { data } = await api.get<AgentsResponse>("/api/agents");
        return data;
      } catch {
        // Backend is not running — serve mock data so the UI always works
        return mockAgents;
      }
    },
    refetchInterval: 10_000, // poll every 10s to pick up live status changes
    // Never treat a resolved promise as an error
    retry: false,
  });
}
