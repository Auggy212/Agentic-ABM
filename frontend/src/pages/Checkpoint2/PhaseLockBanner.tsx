import { Link } from "react-router-dom";
import { useCP2State } from "./hooks";

export default function PhaseLockBanner({ clientId }: { clientId?: string }) {
  const { data } = useCP2State(clientId);
  if (!data || data.status === "APPROVED") return null;

  return (
    <div
      data-testid="phase-lock-banner"
      style={{
        background: "#fffbeb",
        border: "1px solid #fde68a",
        color: "#92400e",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      <span>🔒 Phase 4 (Storyteller) locked — CP2 review pending.</span>
      <Link to="/checkpoint-2" style={{ color: "#92400e", textDecoration: "underline" }}>
        Open CP2 →
      </Link>
    </div>
  );
}
