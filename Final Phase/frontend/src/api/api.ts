/**
 * src/api/api.ts
 * Central API module — wraps fetch calls + React Query hooks.
 * In development, MSW intercepts all requests and returns mock data.
 */
import { useQuery, useMutation, type UseQueryOptions, type UseMutationOptions } from "@tanstack/react-query";
import type {
  AccountsListResponse,
  Account,
  BuyersResponse,
  SignalsResponse,
  CampaignReportResponse,
  CampaignHandoffRequest,
  CampaignHandoffResponse,
  ContactMessagesResponse,
} from "../types/api.types";

// ─── Generic fetch helper ─────────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { data: null, error: { message: text || `HTTP ${res.status}` } };
    }
    const data: T = await res.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Network error" } };
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<{
  data: Account[] | null;
  error: { message: string } | null;
}> {
  const result = await apiFetch<AccountsListResponse>("/api/accounts");
  return { data: result.data?.items ?? null, error: result.error };
}

export async function fetchAccountById(id: string): Promise<{
  data: Account | null;
  error: { message: string } | null;
}> {
  const result = await apiFetch<{ account: Account }>(`/api/accounts/${id}`);
  return { data: result.data?.account ?? null, error: result.error };
}

// ─── Buyers ───────────────────────────────────────────────────────────────────

export async function fetchBuyers(domain: string): Promise<{
  data: BuyersResponse | null;
  error: { message: string } | null;
}> {
  return apiFetch<BuyersResponse>(`/api/buyers?domain=${encodeURIComponent(domain)}`);
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export async function fetchSignals(domain: string): Promise<{
  data: SignalsResponse | null;
  error: { message: string } | null;
}> {
  return apiFetch<SignalsResponse>(`/api/signals?domain=${encodeURIComponent(domain)}`);
}

// ─── Verification ─────────────────────────────────────────────────────────────

export function useVerificationStatusQuery<TData = unknown>(
  options?: Omit<UseQueryOptions<unknown, Error, TData>, "queryKey" | "queryFn">
) {
  return useQuery<unknown, Error, TData>({
    queryKey: ["verification-status"],
    queryFn: async () => {
      const res = await fetch("/api/verification/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    ...options,
  });
}

export function useRunVerificationMutation(
  options?: UseMutationOptions<unknown, Error, void>
) {
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/verification/run", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    ...options,
  });
}

// ─── Campaign Report ──────────────────────────────────────────────────────────

export function useCampaignReportQuery<TData = CampaignReportResponse>(
  options?: Omit<UseQueryOptions<CampaignReportResponse, Error, TData>, "queryKey" | "queryFn">
) {
  return useQuery<CampaignReportResponse, Error, TData>({
    queryKey: ["campaign-report"],
    queryFn: async () => {
      const res = await fetch("/api/campaign/report");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<CampaignReportResponse>;
    },
    ...options,
  });
}

// ─── Contact Messages (Storyteller) ──────────────────────────────────────────

export function useContactMessagesQuery<TData = ContactMessagesResponse>(
  contactId: string,
  options?: Omit<UseQueryOptions<ContactMessagesResponse, Error, TData>, "queryKey" | "queryFn">
) {
  return useQuery<ContactMessagesResponse, Error, TData>({
    queryKey: ["contact-messages", contactId],
    queryFn: async () => {
      const res = await fetch(`/api/messages/contact/${contactId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ContactMessagesResponse>;
    },
    enabled: Boolean(contactId),
    ...options,
  });
}

// ─── Sales Acceptance ─────────────────────────────────────────────────────────

interface AcceptLeadVariables {
  contactId: string;
  payload: CampaignHandoffRequest;
}

export function useAcceptLeadMutation(
  options?: UseMutationOptions<CampaignHandoffResponse, Error, AcceptLeadVariables>
) {
  return useMutation<CampaignHandoffResponse, Error, AcceptLeadVariables>({
    mutationFn: async ({ contactId, payload }) => {
      const res = await fetch(`/api/campaign/handoff/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<CampaignHandoffResponse>;
    },
    ...options,
  });
}
