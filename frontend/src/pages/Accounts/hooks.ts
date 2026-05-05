import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { api } from "@/lib/api";
import type {
  AccountRecord,
  AccountsFilters,
  AccountsListMeta,
  AccountsListResponse,
  CheckpointApprovalResponse,
  RemoveAccountPayload,
  RemoveAccountResult,
} from "./types";

const DEFAULT_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

function buildTierBreakdown(accounts: AccountRecord[]) {
  return {
    tier_1: accounts.filter((account) => account.tier === "TIER_1").length,
    tier_2: accounts.filter((account) => account.tier === "TIER_2").length,
    tier_3: accounts.filter((account) => account.tier === "TIER_3").length,
  };
}

function inferMeta(data: AccountsListResponse, clientId: string): AccountsListMeta {
  return {
    total_found: data.total ?? data.accounts.length,
    tier_breakdown: buildTierBreakdown(data.accounts),
    generated_at: new Date().toISOString(),
    client_id: clientId,
    run_status: "needs_review",
    flagged_accounts: data.accounts.filter((account) => account.tier !== "TIER_1").length,
    phase_2_locked: true,
    quota_warnings: [],
    share_token: null,
  };
}

function normalizeResponse(data: AccountsListResponse, clientId: string): AccountsListResponse {
  const accounts = data.accounts.map((account, index) => ({
    ...account,
    id: account.id ?? `${account.domain}-${index}`,
  }));

  return {
    ...data,
    accounts,
    total: data.total ?? accounts.length,
    page: data.page ?? 1,
    page_size: data.page_size ?? accounts.length,
    meta: data.meta ?? inferMeta({ ...data, accounts }, clientId),
  };
}

function buildQueryParams(clientId: string, filters: AccountsFilters) {
  return {
    client_id: clientId,
    tier: filters.tier === "ALL" ? undefined : filters.tier,
    min_score: filters.minScore,
    max_score: filters.maxScore,
    search: filters.search || undefined,
    source: filters.sources.length > 0 ? filters.sources.join(",") : undefined,
  };
}

function updateMetaAfterRemoval(meta: AccountsListMeta | undefined, nextAccounts: AccountRecord[]) {
  if (!meta) {
    return undefined;
  }

  return {
    ...meta,
    total_found: nextAccounts.length,
    tier_breakdown: buildTierBreakdown(nextAccounts),
    flagged_accounts: nextAccounts.filter((account) => account.tier !== "TIER_1").length,
  };
}

export function useAccounts({
  clientId = DEFAULT_CLIENT_ID,
  filters,
}: {
  clientId?: string;
  filters: AccountsFilters;
}) {
  return useQuery({
    queryKey: ["accounts", clientId, filters],
    queryFn: async () => {
      const { data } = await api.get<AccountsListResponse>("/api/accounts", {
        params: buildQueryParams(clientId, filters),
      });
      return normalizeResponse(data, clientId);
    },
    placeholderData: keepPreviousData,
  });
}

export function useAccount(id: string | undefined) {
  return useQuery({
    queryKey: ["account", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await api.get<AccountRecord>(`/api/accounts/${id}`);
      return data;
    },
  });
}

export function useRemoveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: RemoveAccountPayload) => {
      const { data } = await api.delete<RemoveAccountResult>(`/api/accounts/${id}`, {
        params: { reason },
      });
      return data;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["accounts"] });

      const snapshots = queryClient.getQueriesData<AccountsListResponse>({ queryKey: ["accounts"] });

      snapshots.forEach(([queryKey, previous]) => {
        if (!previous) {
          return;
        }

        const nextAccounts = previous.accounts.filter((account) => account.id !== id);
        queryClient.setQueryData<AccountsListResponse>(queryKey, {
          ...previous,
          accounts: nextAccounts,
          total: nextAccounts.length,
          meta: updateMetaAfterRemoval(previous.meta, nextAccounts),
        });
      });

      queryClient.removeQueries({ queryKey: ["account", id] });

      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([queryKey, previous]) => {
        queryClient.setQueryData(queryKey, previous);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

export function useApproveCheckpoint1(clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        const { data } = await api.post<CheckpointApprovalResponse>("/api/checkpoints/1/approve", {
          client_id: clientId,
        });
        return data;
      } catch (error) {
        const axiosError = error as AxiosError;

        // TODO: remove this fallback once the checkpoint approval endpoint lands in the backend.
        if (axiosError.response?.status === 404) {
          return {
            checkpoint: 1,
            status: "approved" as const,
            approved_at: new Date().toISOString(),
            stubbed: true,
          };
        }

        throw error;
      }
    },
    onSuccess: () => {
      const queries = queryClient.getQueriesData<AccountsListResponse>({ queryKey: ["accounts", clientId] });
      queries.forEach(([queryKey, previous]) => {
        if (!previous?.meta) {
          return;
        }
        queryClient.setQueryData<AccountsListResponse>(queryKey, {
          ...previous,
          meta: {
            ...previous.meta,
            run_status: "approved",
            phase_2_locked: false,
          },
        });
      });
    },
  });
}
