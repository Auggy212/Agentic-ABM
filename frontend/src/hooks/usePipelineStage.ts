import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

export type PhaseStatus = "done" | "active" | "locked";

export interface PipelineStage {
  intake: PhaseStatus;
  icp_scout: PhaseStatus;
  buyer_intel: PhaseStatus;
  signal_intel: PhaseStatus;
  checkpoint_2: PhaseStatus;
  verification: PhaseStatus;
  storyteller: PhaseStatus;
  checkpoint_3: PhaseStatus;
  checkpoint_4: PhaseStatus;
  campaigns: PhaseStatus;
}

interface PipelineStatusResponse {
  agents: Record<string, { status: string }>;
  cp2_status: string;
  cp3_status: string;
}

function derive(data: PipelineStatusResponse): PipelineStage {
  const a = data.agents;
  const done = (k: string) => a[k]?.status === "COMPLETED";
  const started = (k: string) => a[k]?.status !== "NOT_STARTED" && a[k]?.status !== undefined;

  const intakeDone = done("intake") || started("icp_scout");
  const icpDone = done("icp_scout");
  const buyerDone = done("buyer_intel");
  const signalDone = done("signal_intel");
  const phase2Done = buyerDone && signalDone;
  const cp2Done = data.cp2_status === "APPROVED" || done("storyteller") || done("campaign");
  const verifierDone = done("verifier");
  const storytellerDone = done("storyteller");
  const cp3Done = data.cp3_status === "APPROVED";
  const cp4Done = done("campaign");

  const s = (cond: boolean, prev: boolean): PhaseStatus =>
    prev ? (cond ? "done" : "active") : "locked";

  return {
    intake: intakeDone ? "done" : "active",
    icp_scout: s(icpDone, intakeDone),
    buyer_intel: s(buyerDone, icpDone),
    signal_intel: s(signalDone, icpDone),
    checkpoint_2: s(cp2Done, phase2Done),
    verification: s(verifierDone, cp2Done),
    storyteller: s(storytellerDone, cp2Done),
    checkpoint_3: s(cp3Done, storytellerDone),
    checkpoint_4: s(cp4Done, cp3Done),
    campaigns: s(false, cp4Done),
  };
}

export function usePipelineStage() {
  const clientId = getActiveClientId();
  return useQuery({
    queryKey: ["pipeline-stage", clientId],
    queryFn: async () => {
      const { data } = await api.get<PipelineStatusResponse>("/api/pipeline/status", {
        params: { client_id: clientId },
      });
      return derive(data);
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
