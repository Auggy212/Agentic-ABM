import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ClientReviewPayload } from "@/mocks/client_review";
import type { FeedbackSentiment } from "@/pages/Checkpoint3/types";

export function useClientReview(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["client-review", shareToken],
    enabled: Boolean(shareToken),
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<ClientReviewPayload>(`/api/client-review/${shareToken}`);
      return data;
    },
  });
}

export function useSubmitFeedback(shareToken: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { messageId: string | null; feedbackText: string; sentiment: FeedbackSentiment }) => {
      const { data } = await api.post(`/api/client-review/${shareToken}/feedback`, {
        message_id: vars.messageId,
        feedback_text: vars.feedbackText,
        sentiment: vars.sentiment,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-review", shareToken] }),
  });
}

export function useApproveClientReview(shareToken: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (signatureName: string) => {
      const { data } = await api.post(`/api/client-review/${shareToken}/approve`, {
        signature_name: signatureName,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-review", shareToken] }),
  });
}
