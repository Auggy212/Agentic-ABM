import { useIntakeStore } from "@/store/intakeStore";
import ATagInput from "@/components/ui/ATag";
import Tooltip from "@/components/ui/Tooltip";

interface Props {
  error?: string;
  confirmationError?: string;
}

export default function NegativeICPField({ error, confirmationError }: Props) {
  const { formData, setField } = useIntakeStore();
  const { negative_icp, negative_icp_confirmed_empty } = formData;
  const hasListEntries = negative_icp.length > 0;

  function handleConfirmEmpty() {
    setField("negative_icp_confirmed_empty", true);
    setField("negative_icp", []);
  }

  function handleConfirmHasExclusions() {
    setField("negative_icp_confirmed_empty", false);
  }

  return (
    <div style={{
      borderRadius: 12,
      border: "2px solid color-mix(in srgb, var(--warn-500) 40%, transparent)",
      background: "var(--warn-50)",
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          marginTop: 2, flexShrink: 0, width: 20, height: 20, borderRadius: "50%",
          background: "var(--warn-500)", display: "grid", placeItems: "center",
        }}>
          <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>!</span>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--warn-700)" }}>
              Accounts to Exclude (Negative ICP)
            </span>
            <span style={{ color: "var(--bad-500)" }}>*</span>
            <Tooltip content="Example: existing customers (acme.com), strategic partners, public companies you don't sell to (google.com, microsoft.com)">
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 16, height: 16, borderRadius: "50%",
                background: "var(--warn-500)", color: "white", fontSize: 10,
                cursor: "help", fontWeight: 700,
              }}>?</span>
            </Tooltip>
          </div>
          <p style={{ fontSize: 12, color: "var(--warn-700)", marginTop: 2, lineHeight: 1.4 }}>
            These domains or company names will be hard-filtered from all discovery results.
            You <strong>must</strong> make an explicit choice below — leaving this unanswered blocks submission.
          </p>
        </div>
      </div>

      {/* Tag input */}
      <div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--warn-700)", marginBottom: 6 }}>
          Domains or company names to exclude
        </label>
        <ATagInput
          value={negative_icp}
          onChange={(v: string[]) => {
            setField("negative_icp", v);
            if (v.length > 0 && negative_icp_confirmed_empty !== false) {
              setField("negative_icp_confirmed_empty", false);
            }
          }}
          placeholder="e.g. acme.com, Competitor Corp"
          disabled={negative_icp_confirmed_empty === true}
        />
        {error && <div style={{ fontSize: 12, color: "var(--bad-700)", marginTop: 4 }}>{error}</div>}
      </div>

      {/* Explicit confirmation */}
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 13, fontWeight: 600, color: "var(--warn-700)", marginBottom: 8 }}>
          Confirm your choice <span style={{ color: "var(--bad-500)" }}>*</span>
        </legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Option A */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "10px 12px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${negative_icp_confirmed_empty === false ? "var(--acc-500)" : "var(--border)"}`,
            background: negative_icp_confirmed_empty === false ? "var(--surface)" : "var(--surface)",
            boxShadow: negative_icp_confirmed_empty === false ? "0 0 0 2px color-mix(in srgb, var(--acc-500) 20%, transparent)" : "none",
            transition: "all 0.12s",
          }}>
            <input
              type="radio"
              name="negative_icp_confirmation"
              style={{ marginTop: 2, accentColor: "var(--acc-600)" }}
              checked={negative_icp_confirmed_empty === false}
              onChange={handleConfirmHasExclusions}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>I have accounts to exclude</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                I've listed the domains / company names above that should never appear in discovery results.
              </div>
              {negative_icp_confirmed_empty === false && !hasListEntries && (
                <div style={{ fontSize: 12, color: "var(--bad-700)", marginTop: 4 }} role="alert">
                  You selected this option but the list is empty. Add at least one entry, or switch to "I have no accounts to exclude".
                </div>
              )}
            </div>
          </label>

          {/* Option B */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "10px 12px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${negative_icp_confirmed_empty === true ? "var(--acc-500)" : "var(--border)"}`,
            background: "var(--surface)",
            boxShadow: negative_icp_confirmed_empty === true ? "0 0 0 2px color-mix(in srgb, var(--acc-500) 20%, transparent)" : "none",
            transition: "all 0.12s",
          }}>
            <input
              type="radio"
              name="negative_icp_confirmation"
              style={{ marginTop: 2, accentColor: "var(--acc-600)" }}
              checked={negative_icp_confirmed_empty === true}
              onChange={handleConfirmEmpty}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>I have no accounts to exclude</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                I've reviewed this deliberately — all discovered accounts should pass through to scoring.
              </div>
            </div>
          </label>
        </div>

        {confirmationError && negative_icp_confirmed_empty === null && (
          <div style={{ fontSize: 12, color: "var(--bad-700)", marginTop: 8 }} role="alert">
            {confirmationError}
          </div>
        )}
      </fieldset>
    </div>
  );
}
