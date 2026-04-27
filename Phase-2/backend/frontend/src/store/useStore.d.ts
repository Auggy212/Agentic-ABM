export interface SelectedCompany {
  name: string;
  domain: string;
}

export interface AppStoreState {
  masterContext: unknown;
  accounts: Array<{
    id: string;
    name: string;
    domain: string;
  }>;
  runStatus: "idle" | "running" | "completed" | "failed";
  selectedCompany: SelectedCompany | null;
  setMasterContext: (masterContext: unknown) => void;
  setAccounts: (accounts: AppStoreState["accounts"]) => void;
  setRunStatus: (runStatus: AppStoreState["runStatus"]) => void;
  setSelectedCompany: (selectedCompany: SelectedCompany | null) => void;
}

export declare const useStore: {
  (): AppStoreState;
  <T>(selector: (state: AppStoreState) => T): T;
};
