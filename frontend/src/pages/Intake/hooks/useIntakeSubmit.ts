import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { submitIntake, type ClarifyingQuestion, type IntakeResponse } from "@/lib/api";
import { useIntakeStore } from "@/store/intakeStore";
import { getActiveClientId } from "@/lib/session";

function buildPayload(formData: ReturnType<typeof useIntakeStore.getState>["formData"]) {
  return {
    company: {
      name: formData.company_name,
      website: formData.website,
      industry: formData.industry,
      stage: formData.stage,
      product: formData.product,
      value_prop: formData.value_prop,
      differentiators: formData.differentiators,
      pricing_model: formData.pricing_model,
      acv_range: formData.acv_range,
      reference_customers: formData.reference_customers,
    },
    icp: {
      industries: formData.icp_industries,
      company_size_employees: formData.company_size_employees,
      company_size_arr: formData.company_size_arr,
      funding_stage: formData.funding_stage,
      geographies: formData.geographies,
      tech_stack_signals: formData.tech_stack_signals,
      buying_triggers: formData.buying_triggers,
      negative_icp: formData.negative_icp,
    },
    buyers: {
      titles: formData.titles,
      seniority: formData.seniority,
      buying_committee_size: formData.buying_committee_size,
      pain_points: formData.pain_points,
      unstated_needs: formData.unstated_needs,
    },
    competitors: formData.competitors,
    gtm: {
      win_themes: formData.win_themes,
      loss_themes: formData.loss_themes,
      channels: formData.channels,
      crm: formData.crm,
      existing_account_list: formData.existing_account_list,
    },
    // Critical: must be set explicitly — never default silently to []
    negative_icp_confirmed_empty: formData.negative_icp_confirmed_empty === true,
    // Pass the authenticated user's client_id so all pipeline data is saved under the same identity
    client_id: getActiveClientId(),
  };
}

export function useIntakeSubmit() {
  const navigate = useNavigate();
  const { formData } = useIntakeStore();
  const [clarifyingQuestions, setClarifyingQuestions] = useState<ClarifyingQuestion[]>([]);
  const [showClarify, setShowClarify] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  const mutation = useMutation<IntakeResponse, Error, Record<string, unknown>>({
    mutationFn: submitIntake,
    onSuccess: (data) => {
      if (data.status === "needs_clarification" && data.clarifying_questions?.length) {
        setClarifyingQuestions(data.clarifying_questions);
        setShowClarify(true);
      } else if (data.status === "complete") {
        showToast("Intake complete. Discovery started.");
        navigate("/accounts");
      }
    },
    onError: (err) => {
      showToast(`Submission failed: ${err.message}`);
    },
  });

  function submit() {
    const payload = { ...buildPayload(formData), force_complete: true };
    mutation.mutate(payload as unknown as Record<string, unknown>);
  }

  function submitWithAnswers(answers: Record<string, string>) {
    const { mergeFields } = useIntakeStore.getState();
    // Write clarification answers back into fields they reference
    Object.entries(answers).forEach(([field, value]) => {
      const parts = field.split(".");
      const section = parts[0];
      const key = parts[1];
      if (!key) return;

      // Array fields: split on comma or semicolon
      const arrayFields = new Set([
        "differentiators", "icp_industries", "icp_buying_triggers",
        "icp_negative_icp", "icp_tech_stack_signals", "icp_geographies",
        "titles", "seniority", "pain_points", "unstated_needs",
        "buying_triggers", "industries",
      ]);

      if (section === "company") {
        const storeKey = key as keyof typeof formData;
        const asArray = arrayFields.has(storeKey);
        mergeFields({ [storeKey]: asArray ? value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : value } as Parameters<typeof mergeFields>[0]);
      } else if (section === "icp") {
        const storeKey = `icp_${key}` as keyof typeof formData;
        const asArray = arrayFields.has(storeKey) || arrayFields.has(key);
        mergeFields({ [storeKey]: asArray ? value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : value } as Parameters<typeof mergeFields>[0]);
      } else if (section === "buyers") {
        const storeKey = key as keyof typeof formData;
        const asArray = arrayFields.has(storeKey);
        mergeFields({ [storeKey]: asArray ? value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : value } as Parameters<typeof mergeFields>[0]);
      }
    });
    setShowClarify(false);
    // Re-submit with force_complete so vague checks are skipped after user has answered
    const updated = useIntakeStore.getState().formData;
    const payload = { ...buildPayload(updated), force_complete: true };
    mutation.mutate(payload as unknown as Record<string, unknown>);
  }

  return {
    submit,
    submitWithAnswers,
    isSubmitting: mutation.isPending,
    error: mutation.error,
    showClarify,
    clarifyingQuestions,
    closeClarify: () => setShowClarify(false),
    toast,
  };
}
