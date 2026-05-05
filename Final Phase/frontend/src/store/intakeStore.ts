import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

export interface IntakeFormData {
  // Step 1 — Company & Product
  company_name: string;
  website: string;
  industry: string;
  stage: string;
  product: string;
  value_prop: string;
  differentiators: string[];
  pricing_model: string;
  acv_range: string;
  reference_customers: string[];

  // Step 2 — ICP
  icp_industries: string[];
  company_size_employees: string;
  company_size_arr: string;
  funding_stage: string[];
  geographies: string[];
  tech_stack_signals: string[];
  buying_triggers: string[];
  negative_icp: string[];
  negative_icp_confirmed_empty: boolean | null; // null = not yet chosen

  // Step 3 — Buyers
  titles: string[];
  seniority: string[];
  buying_committee_size: string;
  pain_points: string[];
  unstated_needs: string[];

  // Step 4 — Competitive & GTM
  competitors: { name: string; weaknesses: string[] }[];
  win_themes: string[];
  loss_themes: string[];
  channels: string[];
  crm: string;
  existing_account_list: string | null;
}

const EMPTY: IntakeFormData = {
  company_name: "",
  website: "",
  industry: "",
  stage: "",
  product: "",
  value_prop: "",
  differentiators: [],
  pricing_model: "",
  acv_range: "",
  reference_customers: [],

  icp_industries: [],
  company_size_employees: "",
  company_size_arr: "",
  funding_stage: [],
  geographies: [],
  tech_stack_signals: [],
  buying_triggers: [],
  negative_icp: [],
  negative_icp_confirmed_empty: null,

  titles: [],
  seniority: [],
  buying_committee_size: "",
  pain_points: [],
  unstated_needs: [],

  competitors: [],
  win_themes: [],
  loss_themes: [],
  channels: [],
  crm: "",
  existing_account_list: null,
};

interface IntakeStore {
  clientId: string;
  step: number;
  formData: IntakeFormData;
  isDirty: boolean;
  lastSaved: Date | null;

  setStep: (step: number) => void;
  setField: <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) => void;
  mergeFields: (partial: Partial<IntakeFormData>) => void;
  rehydrate: (data: Partial<IntakeFormData>) => void;
  markSaved: () => void;
  reset: () => void;
}

export const useIntakeStore = create<IntakeStore>((set) => ({
  clientId: uuidv4(),
  step: 1,
  formData: { ...EMPTY },
  isDirty: false,
  lastSaved: null,

  setStep: (step) => set({ step }),

  setField: (key, value) =>
    set((s) => ({
      formData: { ...s.formData, [key]: value },
      isDirty: true,
    })),

  mergeFields: (partial) =>
    set((s) => ({
      formData: { ...s.formData, ...partial },
      isDirty: true,
    })),

  rehydrate: (data) =>
    set((s) => ({
      formData: { ...s.formData, ...data },
      isDirty: false,
    })),

  markSaved: () => set({ isDirty: false, lastSaved: new Date() }),

  reset: () =>
    set({
      clientId: uuidv4(),
      step: 1,
      formData: { ...EMPTY },
      isDirty: false,
      lastSaved: null,
    }),
}));
