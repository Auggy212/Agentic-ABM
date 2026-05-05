import Modal from "@/components/ui/Modal";
import type { EmailEngineResult, EmailVerification } from "./types";
import { formatRelativeTime } from "./verificationUi";

function ResultLine({ label, result }: { label: string; result: EmailEngineResult | null }) {
  if (!result) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-3)", padding: "8px 0" }}>
        {label}: not run
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "130px 1fr",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
        status={result.status.toLowerCase()} | confidence={result.confidence.toFixed(2)} |
        sub_status={result.sub_status || "null"} | checked {formatRelativeTime(result.checked_at)}
      </div>
    </div>
  );
}

export default function EmailEngineDetail({
  open,
  verification,
  onClose,
}: {
  open: boolean;
  verification: EmailVerification | null;
  onClose: () => void;
}) {
  if (!verification) return null;

  const finalReason = verification.secondary_result
    ? "ZeroBounce override"
    : `${verification.primary_engine === "NEVERBOUNCE" ? "NeverBounce" : "ZeroBounce"} primary result`;

  return (
    <Modal open={open} onClose={onClose} title="Email engine detail" size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <ResultLine label="NeverBounce" result={verification.primary_result} />
        <ResultLine label="ZeroBounce" result={verification.secondary_result} />
        <div style={{ paddingTop: 12, fontSize: 14, fontWeight: 700 }}>
          Final: {verification.final_status} <span style={{ color: "var(--text-3)", fontWeight: 500 }}>({finalReason})</span>
        </div>
      </div>
    </Modal>
  );
}
