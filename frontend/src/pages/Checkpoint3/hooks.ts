import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CP3ReviewState, MessageReview, MessageReviewDecision, ClientFeedback } from "./types";
import { DEFAULT_CP3_CLIENT_ID } from "./types";

const cp3Key = (clientId: string) => ["cp3", clientId];

export function useCP3State(clientId: string | undefined | null) {
  const resolved = clientId || DEFAULT_CP3_CLIENT_ID;
  return useQuery({
    queryKey: cp3Key(resolved),
    queryFn: async () => {
      const { data } = await api.get<CP3ReviewState>("/api/checkpoint-3", {
        params: { client_id: resolved },
      });
      return data;
    },
  });
}

export function useReviewMessage(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      messageId: string;
      decision: MessageReviewDecision;
      edits?: { layer: string; before: string; after: string }[];
      reviewNotes?: string | null;
    }) => {
      const { data } = await api.patch<MessageReview>(`/api/checkpoint-3/messages/${vars.messageId}`, {
        decision: vars.decision,
        edits: vars.edits ?? null,
        review_notes: vars.reviewNotes ?? null,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cp3Key(clientId) }),
  });
}

export function useMessageOpened(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { data } = await api.post<{ opened_count: number }>(`/api/checkpoint-3/messages/${messageId}/opened`, {});
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cp3Key(clientId) }),
  });
}

export function useApproveBuyer(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { contactId: string; buyerNotes?: string | null }) => {
      const { data } = await api.post(
        `/api/checkpoint-3/buyers/${vars.contactId}/approve`,
        { buyer_notes: vars.buyerNotes ?? null },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cp3Key(clientId) }),
  });
}

export function useMarkOperatorComplete(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<CP3ReviewState>(
        "/api/checkpoint-3/operator-complete",
        { reviewer_notes: "Operator review complete" },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: (data) => qc.setQueryData(cp3Key(clientId), data),
  });
}

export function useSendToClient(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { clientEmail: string; sampleMessageIds: string[] }) => {
      const { data } = await api.post<{ share_url: string; email_status: string }>(
        "/api/checkpoint-3/send-to-client",
        { client_email: vars.clientEmail, sample_message_ids: vars.sampleMessageIds },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cp3Key(clientId) }),
  });
}

export function useResolveFeedback(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { feedbackId: string; resolutionNotes: string }) => {
      const { data } = await api.post<ClientFeedback>(
        `/api/checkpoint-3/feedback/${vars.feedbackId}/resolve`,
        { resolution_notes: vars.resolutionNotes },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cp3Key(clientId) }),
  });
}

export function useApproveCP3(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<CP3ReviewState>(
        "/api/checkpoint-3/approve",
        { reviewer_notes: "Approved after client sign-off" },
        { params: { client_id: clientId } },
      );
      return data;
    },
    onSuccess: (data) => qc.setQueryData(cp3Key(clientId), data),
  });
}

