import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

export interface NavCounts {
  accounts: number;
  sequences: number;
  agents: string;
}

export function useNavCounts() {
  const clientId = getActiveClientId();
  return useQuery({
    queryKey: ["nav-counts", clientId],
    queryFn: async () => {
      const { data } = await api.get<NavCounts>("/api/nav-counts", {
        params: { client_id: clientId },
      });
      return data;
    },
    refetchInterval: 15_000,
  });
}
