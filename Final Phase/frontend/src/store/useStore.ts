import { create } from "zustand";

export interface SelectedCompany {
  id?: string;
  name?: string;
  domain: string;
}

interface AppStore {
  selectedCompany: SelectedCompany | null;
  setSelectedCompany: (company: SelectedCompany | null) => void;
}

export const useStore = create<AppStore>((set) => ({
  selectedCompany: null,
  setSelectedCompany: (company) => set({ selectedCompany: company }),
}));
