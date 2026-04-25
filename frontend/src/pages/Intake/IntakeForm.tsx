import { useEffect, useState } from "react";
import { useIntakeStore } from "@/store/intakeStore";
import Btn from "@/components/ui/Btn";
import Icon from "@/components/ui/Icon";
import { formatRelativeTime } from "@/lib/utils";
import CompanyStep, { companySchema } from "./steps/CompanyStep";
import ICPStep, { icpSchema } from "./steps/ICPStep";
import BuyersStep, { buyersSchema } from "./steps/BuyersStep";
import GTMStep, { gtmSchema } from "./steps/GTMStep";
import { useAutoSave } from "./hooks/useAutoSave";
import { useIntakeSubmit } from "./hooks/useIntakeSubmit";
import ClarifyingQuestionsModal from "./ClarifyingQuestionsModal";
import { z } from "zod";

const STEPS = [
  { id: 1, title: "Company & Product",      short: "Company" },
  { id: 2, title: "Ideal Customer Profile", short: "ICP"     },
  { id: 3, title: "Buyers & Stakeholders",  short: "Buyers"  },
  { id: 4, title: "Competitive & GTM",      short: "GTM"     },
] as const;

type StepErrors = Partial<Record<string, string>>;

function validateStep(step: number, formData: ReturnType<typeof useIntakeStore.getState>["formData"]): StepErrors {
  const schemas: Record<number, z.ZodTypeAny> = { 1: companySchema, 2: icpSchema, 3: buyersSchema, 4: gtmSchema };
  const schema = schemas[step];
  if (!schema) return {};

  const stepData: Record<string, unknown> = {
    company_name: formData.company_name, website: formData.website,
    industry: formData.industry, stage: formData.stage,
    product: formData.product, value_prop: formData.value_prop,
    differentiators: formData.differentiators, pricing_model: formData.pricing_model,
    acv_range: formData.acv_range, reference_customers: formData.reference_customers,
    icp_industries: formData.icp_industries, company_size_employees: formData.company_size_employees,
    company_size_arr: formData.company_size_arr, funding_stage: formData.funding_stage,
    geographies: formData.geographies, tech_stack_signals: formData.tech_stack_signals,
    buying_triggers: formData.buying_triggers, negative_icp: formData.negative_icp,
    negative_icp_confirmed_empty: formData.negative_icp_confirmed_empty,
    titles: formData.titles, seniority: formData.seniority,
    buying_committee_size: formData.buying_committee_size,
    pain_points: formData.pain_points, unstated_needs: formData.unstated_needs,
    competitors: formData.competitors, win_themes: formData.win_themes,
    loss_themes: formData.loss_themes, channels: formData.channels,
    crm: formData.crm, existing_account_list: formData.existing_account_list,
  };

  const result = schema.safeParse(stepData);
  if (result.success) return {};
  const errors: StepErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

const STEP_HEADLINES = [
  <>Tell us about <em>your company</em>.</>,
  <>Define your <em>ideal customer</em>.</>,
  <>Who <em>champions</em> your deals?</>,
  <>How do you <em>compete and reach</em> them?</>,
];
const STEP_SUBS = [
  "Just enough context for the agents to write outreach in your voice and pick relevant proof points.",
  "ICP Scout uses this to score 200+ candidate accounts and remove the misfits before you see them.",
  "Buyer Intel maps people, not just companies. The more specific, the better the personalisation.",
  "Sequence Author writes plays grounded in how you actually win. Optional CSV jump-starts the run.",
];

export default function IntakeForm() {
  const { step, setStep, formData } = useIntakeStore();
  const { isSaving, lastSaved } = useAutoSave();
  const { submit, submitWithAnswers, isSubmitting, error, showClarify, clarifyingQuestions, closeClarify, toast } = useIntakeSubmit();

  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<StepErrors>({});

  useEffect(() => {
    if (touched) setErrors(validateStep(step, formData));
  }, [formData, step, touched]);

  const isLastStep = step === STEPS.length;
  const hasErrors = Object.keys(errors).length > 0;

  function handleNext() {
    setTouched(true);
    const errs = validateStep(step, formData);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setTouched(false);
    setErrors({});
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setTouched(false);
    setErrors({});
    setStep(step - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit() {
    setTouched(true);
    const errs = validateStep(step, formData);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    submit();
  }

  return (
    <>
      {/* Page header */}
      <div className="page-head">
        <div>
          <div className="page-head-meta">Strategic intake · 4 steps · ~10 min</div>
          <h1>Tell the engine who you are</h1>
        </div>
        <div className="page-head-actions">
          <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 6 }}>
            {isSaving ? (
              <>
                <svg style={{ animation: "spin 1s linear infinite", width: 11, height: 11 }} fill="none" viewBox="0 0 24 24">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Saving…
              </>
            ) : lastSaved ? (
              <>
                <span className="dot dot-good" />
                Auto-saved {formatRelativeTime(lastSaved)}
              </>
            ) : (
              <><span className="dot dot-good" />saved · resume from any device</>
            )}
          </span>
          <Btn variant="ghost" size="sm">Resume later</Btn>
        </div>
      </div>

      {/* Body */}
      <div className="intake-shell">
        {/* Step pills */}
        <div className="intake-progress">
          {STEPS.map((s) => {
            const state = s.id === step ? "active" : s.id < step ? "done" : "";
            return (
              <button
                key={s.id}
                className="intake-step-pill"
                data-state={state}
                onClick={() => { if (s.id <= step) setStep(s.id); }}
              >
                <span className="intake-step-num">
                  {s.id < step ? "✓" : s.id}
                </span>
                <span className="intake-step-label">
                  <div style={{ fontSize: 10, opacity: 0.6, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Step {s.id}
                  </div>
                  {s.short}
                </span>
              </button>
            );
          })}
        </div>

        {/* Headline */}
        <div className="section-eyebrow" style={{ marginBottom: 10 }}>Step {step} of 4</div>
        <h2 className="intake-h">{STEP_HEADLINES[step - 1]}</h2>
        <p className="intake-sub">{STEP_SUBS[step - 1]}</p>

        {/* Error banner */}
        {touched && hasErrors && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 10,
            background: "var(--bad-50)", border: "1px solid color-mix(in srgb, var(--bad-500) 30%, transparent)",
            color: "var(--bad-700)", fontSize: 13,
          }}>
            Please fix the highlighted errors before continuing.
          </div>
        )}

        {/* Form card */}
        <div className="card card-pad">
          {step === 1 && <CompanyStep errors={errors} />}
          {step === 2 && <ICPStep errors={errors} />}
          {step === 3 && <BuyersStep errors={errors} />}
          {step === 4 && <GTMStep errors={errors} />}
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10,
            background: "var(--bad-50)", border: "1px solid color-mix(in srgb, var(--bad-500) 30%, transparent)",
            color: "var(--bad-700)", fontSize: 13,
          }}>
            Submission failed: {error.message}. Please try again.
          </div>
        )}

        {/* Footer nav */}
        <div className="intake-foot">
          <Btn variant="" disabled={step === 1 || isSubmitting} onClick={handleBack}>
            ← Back
          </Btn>
          {isLastStep ? (
            <Btn variant="accent" icon="sparkle" loading={isSubmitting} onClick={handleSubmit}>
              Submit &amp; start discovery
            </Btn>
          ) : (
            <Btn variant="primary" onClick={handleNext}>
              Next: {STEPS[step].short} →
            </Btn>
          )}
          <span className="save-state">
            <span className="dot dot-good" />saved · resume from any device
          </span>
        </div>
      </div>

      <ClarifyingQuestionsModal
        open={showClarify}
        onClose={closeClarify}
        questions={clarifyingQuestions}
        onSubmit={submitWithAnswers}
        isSubmitting={isSubmitting}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 50,
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--ink-900)", color: "var(--ink-paper)",
            padding: "10px 16px", borderRadius: 12, fontSize: 13,
            boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
          }}
        >
          <Icon name="check" size={14} />
          {toast}
        </div>
      )}
    </>
  );
}
