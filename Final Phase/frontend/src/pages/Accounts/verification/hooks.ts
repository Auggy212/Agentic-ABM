import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { VerifiedDataPackage, VerificationResult } from "./types";

export const DEFAULT_VERIFICATION_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

export function useGlobalVerificationStats(clientId: string | null | undefined) {
  const resolvedClientId = clientId || DEFAULT_VERIFICATION_CLIENT_ID;
  return useQuery({
    queryKey: ["verification", "client", resolvedClientId],
    queryFn: async () => {
      const { data } = await api.get<VerifiedDataPackage>("/api/verify", {
        params: { client_id: resolvedClientId },
      });
      return data;
    },
  });
}

export function useVerificationByAccount(
  domain: string | undefined,
  clientId: string | null | undefined,
) {
  const query = useGlobalVerificationStats(clientId);
  return {
    ...query,
    data: query.data
      ? {
          ...query.data,
          verifications: query.data.verifications.filter(
            (verification) => verification.account_domain === domain,
          ),
        }
      : undefined,
  };
}

export function useVerificationByContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ["verification", "contact", contactId],
    enabled: Boolean(contactId),
    queryFn: async () => {
      const { data } = await api.get<VerificationResult>(`/api/verify/contact/${contactId}`);
      return data;
    },
  });
}

export function useRecheckContact(contactId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetContactId: string | undefined = contactId) => {
      if (!targetContactId) {
        throw new Error("contactId is required for verification re-check");
      }
      const { data } = await api.post(`/api/verify/contact/${targetContactId}/recheck`);
      return data;
    },
    onSuccess: (_data, targetContactId) => {
      queryClient.invalidateQueries({ queryKey: ["verification"] });
      queryClient.invalidateQueries({
        queryKey: ["verification", "contact", targetContactId ?? contactId],
      });
    },
  });
}
