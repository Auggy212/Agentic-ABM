import { z } from "zod";
import { useIntakeStore } from "@/store/intakeStore";
import ATagInput from "@/components/ui/ATag";
import RadioCards from "@/components/ui/RadioCards";

export const companySchema = z.object({
  company_name:        z.string().min(1, "Company name is required"),
  website:             z.string().url("Must be a valid URL (include https://)"),
  industry:            z.string().min(1, "Industry is required"),
  stage:               z.enum(["Seed", "Series A", "Series B", "Growth", "Enterprise"], {
                         errorMap: () => ({ message: "Select a funding stage" }),
                       }),
  product:             z.string().min(1, "One-line product description is required"),
  value_prop:          z.string().min(15, "Value proposition must be at least 15 words").refine(
                         (v) => v.trim().split(/\s+/).length >= 15,
                         "Value proposition must be at least 15 words"
                       ),
  differentiators:     z.array(z.string()).min(1, "Add at least one differentiator"),
  pricing_model:       z.enum(["Subscription", "Usage-based", "One-time", "Enterprise"], {
                         errorMap: () => ({ message: "Select a pricing model" }),
                       }),
  acv_range:           z.string().min(1, "ACV range is required"),
  reference_customers: z.array(z.string()),
});

export type CompanyStepData = z.infer<typeof companySchema>;

interface Props { errors: Partial<Record<string, string>>; }

export default function CompanyStep({ errors }: Props) {
  const { formData, setField } = useIntakeStore();

  return (
    <div>
      <div className="intake-2col">
        <div className="intake-field">
          <label className="intake-field-label" htmlFor="company_name">Company name <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <input id="company_name" className="abm-input" value={formData.company_name} onChange={(e) => setField("company_name", e.target.value)} placeholder="Acme AI" />
          {errors.company_name && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.company_name}</div>}
        </div>
        <div className="intake-field">
          <label className="intake-field-label" htmlFor="website">Website <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <input id="website" className="abm-input" type="url" value={formData.website} onChange={(e) => setField("website", e.target.value)} placeholder="https://yourcompany.com" />
          {errors.website && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.website}</div>}
        </div>
      </div>

      <div className="intake-2col">
        <div className="intake-field">
          <label className="intake-field-label" htmlFor="industry">Industry <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <input id="industry" className="abm-input" value={formData.industry} onChange={(e) => setField("industry", e.target.value)} placeholder="e.g. B2B SaaS, Fintech, Healthcare IT" />
          {errors.industry && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.industry}</div>}
        </div>
        <div className="intake-field">
          <label className="intake-field-label" htmlFor="stage">Funding stage <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <select id="stage" className="abm-input" value={formData.stage} onChange={(e) => setField("stage", e.target.value)}>
            <option value="">Select stage…</option>
            {(["Seed", "Series A", "Series B", "Growth", "Enterprise"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors.stage && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.stage}</div>}
        </div>
      </div>

      <div className="intake-field">
        <label className="intake-field-label" htmlFor="product">What do you sell? <span style={{ color: "var(--bad-500)" }}>*</span></label>
        <textarea id="product" className="abm-input" rows={3} value={formData.product} onChange={(e) => setField("product", e.target.value)} placeholder="One paragraph the agent can paraphrase in cold outreach. Keep it concrete." />
        {errors.product && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.product}</div>}
      </div>

      <div className="intake-field">
        <label className="intake-field-label" htmlFor="value_prop">Headline value prop <span style={{ color: "var(--bad-500)" }}>*</span></label>
        <input id="value_prop" className="abm-input" value={formData.value_prop} onChange={(e) => setField("value_prop", e.target.value)} placeholder="We help [persona] achieve [outcome] by [mechanism] — so they can [benefit]." />
        <div className="intake-field-hint">Minimum 15 words. Describe the outcome, not the feature.</div>
        {errors.value_prop && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.value_prop}</div>}
      </div>

      <div className="intake-field">
        <label className="intake-field-label">Pricing model <span style={{ color: "var(--bad-500)" }}>*</span></label>
        <RadioCards
          value={formData.pricing_model}
          onChange={(v) => setField("pricing_model", v)}
          options={[
            { value: "Subscription",  label: "Subscription",  hint: "Annual contract" },
            { value: "Usage-based",   label: "Usage-based",   hint: "Per credit / call" },
            { value: "One-time",      label: "One-time",      hint: "One-time purchase" },
            { value: "Enterprise",    label: "Enterprise",    hint: "Platform + usage" },
          ]}
        />
        {errors.pricing_model && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.pricing_model}</div>}
      </div>

      <div className="intake-2col">
        <div className="intake-field">
          <label className="intake-field-label" htmlFor="acv_range">ACV range <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <input id="acv_range" className="abm-input" value={formData.acv_range} onChange={(e) => setField("acv_range", e.target.value)} placeholder="e.g. $10k–$50k" />
          <div className="intake-field-hint">Annual contract value for a typical deal</div>
          {errors.acv_range && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.acv_range}</div>}
        </div>
        <div className="intake-field">
          <label className="intake-field-label">Key differentiators <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <ATagInput
            value={formData.differentiators}
            onChange={(v) => setField("differentiators", v)}
            placeholder="Type a differentiator and press Enter"
          />
          <div className="intake-field-hint">Press Enter to add. At least one required.</div>
          {errors.differentiators && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.differentiators}</div>}
        </div>
      </div>

      <div className="intake-field">
        <label className="intake-field-label">Reference customers</label>
        <ATagInput
          value={formData.reference_customers}
          onChange={(v) => setField("reference_customers", v)}
          placeholder="Type a customer name and press Enter"
        />
        <div className="intake-field-hint">Named logos or customer references (optional)</div>
      </div>
    </div>
  );
}
