import { create } from "zustand";

export const useStore = create((set) => ({
  masterContext: null,
  accounts: [],
  runStatus: "idle",
  selectedCompany: null,
  setMasterContext: (masterContext) => set({ masterContext }),
  setAccounts: (accounts) => set({ accounts }),
  setRunStatus: (runStatus) => set({ runStatus }),
  setSelectedCompany: (selectedCompany) => set({ selectedCompany })
}));
