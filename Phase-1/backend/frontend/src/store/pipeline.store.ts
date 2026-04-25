import { create } from "zustand";
import type { Account, IntakeRequest } from "../types/api.types";

type RunStatus = "idle" | "running" | "completed" | "failed";

interface PipelineStore {
  masterContext: IntakeRequest | null;
  accounts: Account[];
  runStatus: RunStatus;
  setMasterContext: (context: IntakeRequest | null) => void;
  setAccounts: (accounts: Account[]) => void;
  setRunStatus: (status: RunStatus) => void;
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  masterContext: null,
  accounts: [],
  runStatus: "idle",
  setMasterContext: (masterContext) => set({ masterContext }),
  setAccounts: (accounts) => set({ accounts }),
  setRunStatus: (runStatus) => set({ runStatus })
}));
