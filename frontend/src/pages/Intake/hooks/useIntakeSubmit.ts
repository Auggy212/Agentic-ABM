import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { submitIntake, type ClarifyingQuestion, type IntakeResponse } from "@/lib/api";
import { useIntakeStore } from "@/store/intakeStore";

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
  });

  function submit() {
    const payload = buildPayload(formData);
    mutation.mutate(payload as unknown as Record<string, unknown>);
  }

  function submitWithAnswers(answers: Record<string, string>) {
    const { mergeFields } = useIntakeStore.getState();
    // Write clarification answers back into fields they reference
    Object.entries(answers).forEach(([field, value]) => {
      const parts = field.split(".");
      if (parts[0] === "company" && parts[1]) {
        mergeFields({ [parts[1]]: value } as Parameters<typeof mergeFields>[0]);
      } else if (parts[0] === "icp" && parts[1]) {
        const icpKey = `icp_${parts[1]}` as keyof typeof formData;
        mergeFields({ [icpKey]: value } as Parameters<typeof mergeFields>[0]);
      }
    });
    setShowClarify(false);
    // Re-submit with updated data
    const updated = useIntakeStore.getState().formData;
    const payload = buildPayload(updated);
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
