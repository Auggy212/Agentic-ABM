import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  BuyersByClientResponse,
  BuyersByDomainResponse,
  DiscoverResponse,
  QuotaStatus,
  UpdateContactRoleRequest,
} from "./types";

export function useBuyersByAccount(domain: string | undefined) {
  return useQuery({
    queryKey: ["buyers", "domain", domain],
    enabled: Boolean(domain),
    queryFn: async () => {
      const { data } = await api.get<BuyersByDomainResponse>("/api/buyers", {
        params: { company: domain },
      });
      return data;
    },
  });
}

export function useBuyersByClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ["buyers", "client", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data } = await api.get<BuyersByClientResponse>("/api/buyers", {
        params: { client_id: clientId },
      });
      return data;
    },
  });
}

export function useQuotaStatus() {
  return useQuery({
    queryKey: ["quota-status"],
    queryFn: async () => {
      const { data } = await api.get<QuotaStatus>("/api/quota/status");
      return data;
    },
    retry: false,
  });
}

export function useUpdateBuyerRole(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: UpdateContactRoleRequest) => {
      const { data } = await api.patch(`/api/buyers/contact/${contactId}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyers"] });
    },
  });
}

export function useDiscoverBuyers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data } = await api.post<DiscoverResponse>("/api/buyers/discover", {
        client_id: clientId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyers"] });
    },
  });
}
