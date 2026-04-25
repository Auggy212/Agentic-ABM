import { z } from "zod";
import { useIntakeStore } from "@/store/intakeStore";
import ATagInput from "@/components/ui/ATag";

export const buyersSchema = z.object({
  titles:                z.array(z.string()).min(1, "Add at least one buyer title"),
  seniority:             z.array(z.string()).min(1, "Add at least one seniority level"),
  buying_committee_size: z.string().min(1, "Committee size is required"),
  pain_points:           z.array(z.string()).min(1, "Add at least one pain point"),
  unstated_needs:        z.array(z.string()),
});

export type BuyersStepData = z.infer<typeof buyersSchema>;

interface Props { errors: Partial<Record<string, string>>; }

const SENIORITY_OPTIONS = ["C-Suite", "VP", "Director", "Manager", "IC"];

export default function BuyersStep({ errors }: Props) {
  const { formData, setField } = useIntakeStore();

  function toggleSeniority(level: string) {
    const current = formData.seniority;
    setField("seniority", current.includes(level) ? current.filter((s) => s !== level) : [...current, level]);
  }

  return (
    <div>
      <div className="intake-field">
        <label className="intake-field-label">Job titles in the buying committee <span style={{ color: "var(--bad-500)" }}>*</span></label>
        <ATagInput value={formData.titles} onChange={(v) => setField("titles", v)} placeholder="e.g. VP Sales, CRO, Head of RevOps" />
        {errors.titles && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.titles}</div>}
      </div>

      <div className="intake-2col">
        <div className="intake-field">
          <label className="intake-field-label">Seniority levels <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {SENIORITY_OPTIONS.map((level) => (
              <button
                key={level}
                type="button"
                className="filter-pill"
                data-active={String(formData.seniority.includes(level))}
                onClick={() => toggleSeniority(level)}
              >
                {level}
              </button>
            ))}
          </div>
          {errors.seniority && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.seniority}</div>}
        </div>

        <div className="intake-field">
          <label className="intake-field-label" htmlFor="committee_size">Committee size (avg) <span style={{ color: "var(--bad-500)" }}>*</span></label>
          <input id="committee_size" className="abm-input" type="text" value={formData.buying_committee_size} onChange={(e) => setField("buying_committee_size", e.target.value)} placeholder="e.g. 3-5" />
          {errors.buying_committee_size && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.buying_committee_size}</div>}
        </div>
      </div>

      <div className="intake-field">
        <label className="intake-field-label">Buyer pain points <span style={{ color: "var(--bad-500)" }}>*</span></label>
        <ATagInput value={formData.pain_points} onChange={(v) => setField("pain_points", v)} placeholder="Type a pain point and press Enter" />
        <div className="intake-field-hint">Buyer Intel uses this to map message themes per persona. Be specific — "pipeline coverage drops mid-quarter" beats "needs more pipeline."</div>
        {errors.pain_points && <div className="intake-field-hint" style={{ color: "var(--bad-700)" }}>{errors.pain_points}</div>}
      </div>

      <div className="intake-field">
        <label className="intake-field-label">Unstated / latent needs</label>
        <ATagInput value={formData.unstated_needs} onChange={(v) => setField("unstated_needs", v)} placeholder="Type a latent need and press Enter" />
        <div className="intake-field-hint">Deeper needs the buyer may not explicitly mention but would value — helps the AI craft resonant messaging.</div>
      </div>
    </div>
  );
}
