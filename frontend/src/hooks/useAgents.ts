import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentsResponse } from "@/types/agents";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await api.get<AgentsResponse>("/api/agents");
      return data;
    },
    refetchInterval: 10_000, // poll every 10s to pick up live status changes
  });
}
