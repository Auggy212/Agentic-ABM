import { useState } from "react";
import { api } from "../lib/api";

type StepKey = "company" | "icp" | "buyers" | "gtm";

type FormData = {
  companyName: string;
  website: string;
  industry: string;
  targetIndustries: string;
  companySize: string;
  geography: string;
  jobTitles: string;
  seniority: string;
  painPoints: string;
  competitors: string;
  channels: string;
  crm: string;
};

type FieldConfig = {
  name: keyof FormData;
  label: string;
  placeholder: string;
};

type StepConfig = {
  key: StepKey;
  title: string;
  description: string;
  fields: FieldConfig[];
};

const initialFormData: FormData = {
  companyName: "",
  website: "",
  industry: "",
  targetIndustries: "",
  companySize: "",
  geography: "",
  jobTitles: "",
  seniority: "",
  painPoints: "",
  competitors: "",
  channels: "",
  crm: ""
};

const steps: StepConfig[] = [
  {
    key: "company",
    title: "Company Info",
    description: "Capture the business basics before we define the ideal customer profile.",
    fields: [
      { name: "companyName", label: "Company Name", placeholder: "Acme AI" },
      { name: "website", label: "Website", placeholder: "https://acme.ai" },
      { name: "industry", label: "Industry", placeholder: "B2B SaaS" }
    ]
  },
  {
    key: "icp",
    title: "ICP Details",
    description: "Define which company segments are the best fit for outreach and pipeline creation.",
    fields: [
      { name: "targetIndustries", label: "Target Industries", placeholder: "Fintech, Healthcare, Cybersecurity" },
      { name: "companySize", label: "Company Size", placeholder: "200-1000 employees" },
      { name: "geography", label: "Geography", placeholder: "North America, UK, DACH" }
    ]
  },
  {
    key: "buyers",
    title: "Buyer Details",
    description: "Describe the stakeholders, decision makers, and the pains that should shape messaging.",
    fields: [
      { name: "jobTitles", label: "Job Titles", placeholder: "VP Sales, RevOps Director, Head of Growth" },
      { name: "seniority", label: "Seniority", placeholder: "Director+, VP, C-Suite" },
      { name: "painPoints", label: "Pain Points", placeholder: "Low conversion, poor lead quality, manual workflows" }
    ]
  },
  {
    key: "gtm",
    title: "GTM Context",
    description: "Round out the intake with market context, channel focus, and systems information.",
    fields: [
      { name: "competitors", label: "Competitors", placeholder: "Apollo, Clay, Common Room" },
      { name: "channels", label: "Channels", placeholder: "Email, LinkedIn, Paid Search" },
      { name: "crm", label: "CRM", placeholder: "Salesforce, HubSpot" }
    ]
  }
];

export function IntakePage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const validateStep = (index: number) => {
    const nextErrors: Partial<Record<keyof FormData, string>> = {};

    for (const field of steps[index].fields) {
      if (!formData[field.name].trim()) {
        nextErrors[field.name] = `${field.label} is required.`;
      }
    }

    setErrors((prev) => ({
      ...prev,
      ...nextErrors
    }));

    return Object.keys(nextErrors).length === 0;
  };

  const handleChange = (name: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));

    setErrors((prev) => {
      if (!prev[name]) {
        return prev;
      }

      const nextErrors = { ...prev };
      delete nextErrors[name];
      return nextErrors;
    });
  };

  const handleNext = () => {
    if (!validateStep(stepIndex)) {
      return;
    }

    setSuccessMessage("");
    setStepIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    setSuccessMessage("");
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateStep(stepIndex)) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSuccessMessage("");
      await api.post("/api/intake", formData);
      setSuccessMessage("Intake submitted successfully. Your request has been queued for processing.");
      setStepIndex(0);
      setFormData(initialFormData);
      setErrors({});
    } catch (error) {
      console.error("Failed to submit intake form", error);
      setSuccessMessage("");
      setErrors((prev) => ({
        ...prev,
        crm: prev.crm,
        companyName: prev.companyName
      }));
      window.alert("Something went wrong while submitting the intake form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-900 px-6 py-6 text-white md:px-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-200">Intake Agent</p>
          <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Multi-step intake form</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-200">
                Gather the key company, ICP, buyer, and go-to-market inputs needed to launch downstream agents.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
              Step {stepIndex + 1} of {steps.length}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {steps.map((step, index) => {
              const isActive = index === stepIndex;
              const isComplete = index < stepIndex;

              return (
                <div
                  key={step.key}
                  className={`rounded-2xl border px-4 py-3 transition ${
                    isActive
                      ? "border-cyan-300 bg-cyan-400/10"
                      : isComplete
                        ? "border-emerald-300/40 bg-emerald-400/10"
                        : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                        isActive
                          ? "bg-cyan-300 text-slate-950"
                          : isComplete
                            ? "bg-emerald-300 text-slate-950"
                            : "bg-white/10 text-slate-200"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="text-xs text-slate-300">{step.key.toUpperCase()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-6 md:px-8 md:py-8">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">{currentStep.title}</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">{currentStep.description}</h3>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {currentStep.fields.map((field) => (
              <label key={field.name} className={`block ${field.name === "painPoints" || field.name === "channels" ? "md:col-span-2" : ""}`}>
                <span className="mb-2 block text-sm font-medium text-slate-700">{field.label}</span>
                <input
                  type="text"
                  value={formData[field.name]}
                  onChange={(event) => handleChange(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  className={`w-full rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-4 ${
                    errors[field.name]
                      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                      : "border-slate-200 focus:border-cyan-400 focus:ring-cyan-100"
                  }`}
                />
                {errors[field.name] ? <span className="mt-2 block text-sm text-red-600">{errors[field.name]}</span> : null}
              </label>
            ))}
          </div>

          {successMessage ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {successMessage}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={stepIndex === 0 || isSubmitting}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>

            <button
              type="button"
              onClick={isLastStep ? handleSubmit : handleNext}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : isLastStep ? "Submit Intake" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
