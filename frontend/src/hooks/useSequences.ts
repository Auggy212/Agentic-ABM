import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SequencesResponse } from "@/types/sequences";

export function useSequences() {
  return useQuery({
    queryKey: ["sequences"],
    queryFn: async () => {
      const { data } = await api.get<SequencesResponse>("/api/sequences");
      return data;
    },
  });
}
