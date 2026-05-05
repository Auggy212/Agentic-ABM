
interface EngagementScoreProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
}

function getColor(score: number): string {
  if (score >= 75) return "#f59e0b"; // amber — hot lead
  if (score >= 50) return "#3b82f6"; // blue — warm
  return "#94a3b8";                  // slate — cool
}

function getTrack(score: number): string {
  if (score >= 75) return "#fef3c7";
  if (score >= 50) return "#dbeafe";
  return "#f1f5f9";
}

export function EngagementScore({
  score,
  size = "md",
  showLabel = true,
  animated = false,
}: EngagementScoreProps) {
  const radius = size === "lg" ? 38 : size === "md" ? 28 : 18;
  const stroke = size === "lg" ? 7 : size === "md" ? 6 : 4;
  const dim = (radius + stroke) * 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const offset = circumference - (progress / 100) * circumference;
  const color = getColor(score);
  const track = getTrack(score);
  const fontSize = size === "lg" ? "1.1rem" : size === "md" ? "0.85rem" : "0.65rem";
  const labelSize = size === "lg" ? "0.75rem" : "0.6rem";

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
        {/* Track */}
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
          style={
            animated
              ? { transition: "stroke-dashoffset 0.8s ease-in-out" }
              : undefined
          }
        />
        {/* Score label */}
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill={color}
          fontWeight="700"
          fontSize={fontSize}
          fontFamily="inherit"
        >
          {score}
        </text>
      </svg>
      {showLabel && (
        <span
          style={{
            fontSize: labelSize,
            fontWeight: 600,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Engagement
        </span>
      )}
    </div>
  );
}
