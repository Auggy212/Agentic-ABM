import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CP2AuditRow,
  CP2ReviewState,
  ReviewDecision,
} from "./types";

export const DEFAULT_CP2_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

const cp2QueryKey = (clientId: string) => ["cp2", clientId];

export function useCP2State(clientId: string | undefined | null) {
  const resolved = clientId || DEFAULT_CP2_CLIENT_ID;
  return useQuery({
    queryKey: cp2QueryKey(resolved),
    queryFn: async () => {
      const { data } = await api.get<CP2ReviewState>("/api/checkpoint-2", {
        params: { client_id: resolved },
      });
      return data;
    },
  });
}

interface ReviewClaimVars {
  claimId: string;
  decision: ReviewDecision;
  correctedText?: string | null;
  reviewNotes?: string | null;
  reviewer?: string;
}

export function useReviewClaim(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: ReviewClaimVars) => {
      const { data } = await api.patch<CP2ReviewState>(
        `/api/checkpoint-2/claims/${vars.claimId}`,
        {
          decision: vars.decision,
          corrected_text: vars.correctedText ?? null,
          review_notes: vars.reviewNotes ?? null,
          reviewer: vars.reviewer,
        },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(cp2QueryKey(clientId), data);
    },
  });
}

export function useApproveAccount(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { domain: string; notes?: string | null }) => {
      const { data } = await api.post<CP2ReviewState>(
        `/api/checkpoint-2/accounts/${encodeURIComponent(vars.domain)}/approve`,
        { account_notes: vars.notes ?? null },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(cp2QueryKey(clientId), data);
    },
  });
}

export function useRemoveAccount(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { domain: string; reason: string }) => {
      const { data } = await api.post<CP2ReviewState>(
        `/api/checkpoint-2/accounts/${encodeURIComponent(vars.domain)}/remove`,
        { reason: vars.reason },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(cp2QueryKey(clientId), data);
    },
  });
}

export function useApproveCP2(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { reviewerNotes?: string | null }) => {
      const { data } = await api.post<CP2ReviewState>(
        "/api/checkpoint-2/approve",
        { reviewer_notes: vars.reviewerNotes ?? null },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(cp2QueryKey(clientId), data);
    },
  });
}

export function useRejectCP2(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { reason: string }) => {
      const { data } = await api.post<CP2ReviewState>(
        "/api/checkpoint-2/reject",
        { reason: vars.reason },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(cp2QueryKey(clientId), data);
    },
  });
}

export function useCP2AuditLog(clientId: string) {
  return useQuery({
    queryKey: ["cp2", clientId, "audit"],
    queryFn: async () => {
      const { data } = await api.get<CP2AuditRow[]>("/api/checkpoint-2/audit", {
        params: { client_id: clientId },
      });
      return data;
    },
  });
}
