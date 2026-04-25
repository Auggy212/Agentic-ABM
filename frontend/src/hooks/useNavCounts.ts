import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface NavCounts {
  accounts: number;
  sequences: number;
  agents: string;
}

export function useNavCounts() {
  return useQuery({
    queryKey: ["nav-counts"],
    queryFn: async () => {
      const { data } = await api.get<NavCounts>("/api/nav-counts");
      return data;
    },
    refetchInterval: 15_000,
  });
}
