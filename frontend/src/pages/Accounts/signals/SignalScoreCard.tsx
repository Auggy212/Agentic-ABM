import type { SignalScore } from "./types";

interface Props {
  score: SignalScore;
}

export default function SignalScoreCard({ score }: Props) {
  return (
    <div
      className="card card-pad"
      style={{ minWidth: 180, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div className="section-eyebrow">Signal score</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ScoreRow label="High signals" count={score.high_count} color="#b91c1c" bg="#fef2f2" />
        <ScoreRow label="Medium signals" count={score.medium_count} color="#b45309" bg="#fffbeb" />
        <ScoreRow label="Low signals" count={score.low_count} color="var(--text-3)" bg="var(--surface-2)" />
        <div
          style={{
            marginTop: 4,
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Total score</span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: "var(--font-display)",
              color: "var(--text-1)",
            }}
          >
            {score.total_score}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)" }}>
          Weighted: HIGH×10 · MED×4 · LOW×1
        </div>
      </div>
    </div>
  );
}

function ScoreRow({
  label,
  count,
  color,
  bg,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--text-2)" }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          minWidth: 24,
          textAlign: "center",
          padding: "2px 8px",
          borderRadius: 10,
          background: bg,
          color,
        }}
      >
        {count}
      </span>
    </div>
  );
}
