import { z } from "zod";
import { useIntakeStore } from "@/store/intakeStore";
import ATagInput from "@/components/ui/ATag";
import NegativeICPField from "../fields/NegativeICPField";

export const icpSchema = z
  .object({
    icp_industries:           z.array(z.string()).min(1, "Add at least one target industry").max(5, "Maximum 5 industries"),
    company_size_employees:   z.string().min(1, "Employee range is required").regex(/^\d+-\d+$/, "Format: 100-500"),
    company_size_arr:         z.string().min(1, "ARR range is required"),
    funding_stage:            z.array(z.string()).min(1, "Select at least one funding stage"),
    geographies:              z.array(z.string()).min(1, "Add at least one geography"),
    tech_stack_signals:       z.array(z.string()),
    buying_triggers:          z.array(z.string()).min(1, "Add at least one buying trigger"),
    negative_icp:             z.array(z.string()),
    negative_icp_confirmed_empty: z
      .union([z.boolean(), z.null()])
      .refine((v) => v !== null, {
        message: "You must explicitly confirm whether you have accounts to exclude",
      }),
  })
  .superRefine((data, ctx) => {
    if (data.negative_icp_confirmed_empty === false && data.negative_icp.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["negative_icp"],
        message: "You indicated accounts to exclude but the list is empty.",
      });
    }
    if (data.negative_icp_confirmed_empty === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["negative_icp_confirmed_empty"],
        message: "You must explicitly confirm whether you have accounts to exclude",
      });
    }
  });

export type ICPStepData = z.infer<typeof icpSchema>;

interface Props { errors: Partial<Record<string, string>>; }

const FUNDING_OPTIONS = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth", "Enterprise"];

export default function ICPStep({ errors }: Props) {
  const { formData, setField } = useIntakeStore();

  function toggleFunding(stage: string) {
    const current = formData.funding_stage;
    setField("funding_stage", current.includes(stage) ? current.filter((s) => s !== stage) : [...current, stage]);
  }

  return (
    <div>
      <div className="intake-field">
        <label className="intake-field-label">
          Target industries <span style={{ color: "var(--bad-500)" }}>*</span>
          <span style={{ marginLeft: 8, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--acc-700)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            ✦ AI suggested
          </span>
        </label>
        <ATagInput
          value={formData.icp_industries}
          onChange={(v) => setField("icp_industries", v)}
          max={5}
          placeholder="Add an industry"
        />
        <div className="intake-field-hint">Max 5 industries. Press Enter to add each.</div>
        {errors.icp_industries && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.icp_industries}</div>}
      </div>

      <div className="intake-3col">
        <div className="intake-field">
          <label className="intake-field-label" htmlFor="employees">Employees <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <input id="employees" className="abm-input" value={formData.company_size_employees} onChange={(e) => setField("company_size_employees", e.target.value)} placeholder="e.g. 100-500" />
          {errors.company_size_employees && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.company_size_employees}</div>}
        </div>
        <div className="intake-field">
          <label className="intake-field-label" htmlFor="arr_band">ARR band <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <input id="arr_band" className="abm-input" value={formData.company_size_arr} onChange={(e) => setField("company_size_arr", e.target.value)} placeholder="e.g. $5M–$50M" />
          {errors.company_size_arr && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.company_size_arr}</div>}
        </div>
        <div className="intake-field">
          <label className="intake-field-label">Funding stages <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {FUNDING_OPTIONS.map((stage) => (
              <button
                key={stage}
                type="button"
                className="filter-pill"
                data-active={String(formData.funding_stage.includes(stage))}
                onClick={() => toggleFunding(stage)}
              >
                {stage}
              </button>
            ))}
          </div>
          {errors.funding_stage && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.funding_stage}</div>}
        </div>
      </div>

      <div className="intake-field">
        <label className="intake-field-label">Target geographies <span style={{ color: "var(--bad-500)" }}>*</span></label>
        <ATagInput value={formData.geographies} onChange={(v) => setField("geographies", v)} placeholder="Type a country or region and press Enter" />
        {errors.geographies && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.geographies}</div>}
      </div>

      <div className="intake-field">
        <label className="intake-field-label">
          Buying triggers <span style={{ color: "var(--bad-500)" }}>*</span>
          <span style={{ marginLeft: 8, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--acc-700)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            ✦ AI suggested
          </span>
        </label>
        <ATagInput value={formData.buying_triggers} onChange={(v) => setField("buying_triggers", v)} placeholder="Type a trigger event and press Enter" />
        <div className="intake-field-hint">Signal Watcher polls these as priorities. Hiring spikes, funding events, tech-stack changes work best.</div>
        {errors.buying_triggers && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.buying_triggers}</div>}
      </div>

      <div className="intake-field">
        <label className="intake-field-label">Technology stack signals</label>
        <ATagInput value={formData.tech_stack_signals} onChange={(v) => setField("tech_stack_signals", v)} placeholder="e.g. HubSpot, Salesforce, Snowflake" />
        <div className="intake-field-hint">Technologies your best customers use — used to find similar companies.</div>
      </div>

      <NegativeICPField error={errors.negative_icp} confirmationError={errors.negative_icp_confirmed_empty} />
    </div>
  );
}
