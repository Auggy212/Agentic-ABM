import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CopilotContextResponse } from "@/types/copilot";

export function useCopilotContext() {
  return useQuery({
    queryKey: ["copilot-context"],
    queryFn: async () => {
      const { data } = await api.get<CopilotContextResponse>("/api/copilot/context");
      return data;
    },
  });
}
