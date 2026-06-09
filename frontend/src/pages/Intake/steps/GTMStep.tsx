import { z } from "zod";
import { useIntakeStore } from "@/store/intakeStore";
import ATagInput from "@/components/ui/ATag";
import Icon from "@/components/ui/Icon";
import CsvUploadField from "../CsvUploadField";

export const gtmSchema = z.object({
  competitors: z
    .array(z.object({ name: z.string().min(1, "Competitor name required"), weaknesses: z.array(z.string()).min(1, "Add at least one weakness") }))
    .min(1, "Add at least one competitor"),
  win_themes:  z.array(z.string()).min(1, "Add at least one win theme"),
  loss_themes: z.array(z.string()).min(1, "Add at least one loss theme"),
  channels:    z.array(z.string()).min(1, "Select at least one outreach channel"),
  crm:         z.enum(["HubSpot", "Salesforce", "Zoho", "Other", "None"], { errorMap: () => ({ message: "Select your CRM" }) }),
  existing_account_list: z.string().nullable(),
});

export type GTMStepData = z.infer<typeof gtmSchema>;

interface Props { errors: Partial<Record<string, string>>; }

const CHANNEL_OPTIONS = ["Email", "LinkedIn", "Phone", "Direct mail", "Webinar", "Field event"] as const;
const CRM_OPTIONS = ["HubSpot", "Salesforce", "Zoho", "Other", "None"] as const;

export default function GTMStep({ errors }: Props) {
  const { formData, setField } = useIntakeStore();

  function toggleChannel(ch: string) {
    const c = formData.channels;
    setField("channels", c.includes(ch) ? c.filter((x) => x !== ch) : [...c, ch]);
  }

  function addCompetitor() {
    setField("competitors", [...formData.competitors, { name: "", weaknesses: [] }]);
  }

  function removeCompetitor(i: number) {
    setField("competitors", formData.competitors.filter((_, idx) => idx !== i));
  }

  function setCompetitorName(i: number, name: string) {
    setField("competitors", formData.competitors.map((c, idx) => idx === i ? { ...c, name } : c));
  }

  function setCompetitorWeaknesses(i: number, weaknesses: string[]) {
    setField("competitors", formData.competitors.map((c, idx) => idx === i ? { ...c, weaknesses } : c));
  }

  return (
    <div>
      {/* Competitors */}
      <div className="intake-field">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label className="intake-field-label" style={{ margin: 0 }}>
            Competitors <span style={{ color: "var(--bad-500)" }}>*</span>
          </label>
          <button type="button" className="btn btn-sm" data-variant="ghost" onClick={addCompetitor}>
            <Icon name="plus" size={12} /> Add competitor
          </button>
        </div>
        {errors.competitors && <div className="intake-field-hint" style={{ color: "var(--bad-700)", marginBottom: 8 }}>{errors.competitors}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {formData.competitors.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", border: "1px dashed var(--border-strong)", borderRadius: 10, color: "var(--text-3)", fontSize: 13 }}>
              No competitors added yet. Click "+ Add competitor" above.
            </div>
          )}
          {formData.competitors.map((comp, i) => (
            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  className="abm-input"
                  style={{ flex: 1 }}
                  value={comp.name}
                  onChange={(e) => setCompetitorName(i, e.target.value)}
                  placeholder="Competitor name (e.g. 6sense)"
                />
                <button type="button" className="btn btn-icon" data-variant="ghost" onClick={() => removeCompetitor(i)} aria-label="Remove competitor">
                  <Icon name="x" size={13} />
                </button>
              </div>
              <div>
                <div className="intake-field-label" style={{ fontSize: 12, marginBottom: 4 }}>Known weaknesses</div>
                <ATagInput value={comp.weaknesses} onChange={(v) => setCompetitorWeaknesses(i, v)} placeholder="Type a weakness and press Enter" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="intake-2col">
        <div className="intake-field">
          <label className="intake-field-label">Win themes <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <ATagInput value={formData.win_themes} onChange={(v) => setField("win_themes", v)} placeholder="Type a win theme and press Enter" />
          <div className="intake-field-hint">Recurring themes in deals you've won.</div>
          {errors.win_themes && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.win_themes}</div>}
        </div>
        <div className="intake-field">
          <label className="intake-field-label">Loss themes <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <ATagInput value={formData.loss_themes} onChange={(v) => setField("loss_themes", v)} placeholder="Type a loss theme and press Enter" />
          <div className="intake-field-hint">Recurring themes in deals you've lost.</div>
          {errors.loss_themes && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.loss_themes}</div>}
        </div>
      </div>

      <div className="intake-field">
        <label className="intake-field-label">Outreach channels <span style={{ color: "var(--bad-500)" }}>*</span></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {CHANNEL_OPTIONS.map((ch) => (
            <button
              key={ch}
              type="button"
              className="filter-pill"
              data-active={String(formData.channels.includes(ch))}
              onClick={() => toggleChannel(ch)}
            >
              {ch}
            </button>
          ))}
        </div>
        {errors.channels && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.channels}</div>}
      </div>

      <div className="intake-field">
        <label className="intake-field-label" htmlFor="crm">CRM platform <span style={{ color: "var(--bad-500)" }}>*</span></label>
        <select id="crm" className="abm-input" value={formData.crm} onChange={(e) => setField("crm", e.target.value)}>
          <option value="">Select your CRM…</option>
          {CRM_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.crm && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.crm}</div>}
      </div>

      <div className="intake-field">
        <label className="intake-field-label">Optional account list</label>
        <div className="upload">
          <Icon name="download" size={20} />
          <div style={{ marginTop: 8 }}><strong>Drop CSV</strong> or browse — domains, company names, or LinkedIn URLs.</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Used as a seed for ICP Scout. Up to 5,000 rows.</div>
        </div>
        <div style={{ marginTop: 10 }}>
          <CsvUploadField />
        </div>
      </div>
    </div>
  );
}
