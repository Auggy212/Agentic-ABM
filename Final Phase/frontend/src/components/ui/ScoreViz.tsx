export type ScoreStyle = "bar" | "bricks" | "ring";
export type ScoreBand = "t1" | "t2" | "t3";

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return "t1";
  if (score >= 60) return "t2";
  return "t3";
}

interface ScoreVizProps {
  score: number;
  band: ScoreBand;
  style?: ScoreStyle;
}

export default function ScoreViz({ score, band, style = "bar" }: ScoreVizProps) {
  if (style === "bricks") {
    const bricks = 10;
    const filled = Math.round((score / 100) * bricks);
    return (
      <span className="score-wrap">
        <span className="score-bricks">
          {Array.from({ length: bricks }, (_, i) => (
            <span
              key={i}
              className="score-brick"
              data-on={String(i < filled)}
              data-band={band}
              style={{ height: `${4 + i}px` }}
            />
          ))}
        </span>
        <span className="score-num">{score}</span>
      </span>
    );
  }

  if (style === "ring") {
    const r = 12;
    const c = 2 * Math.PI * r;
    const off = c - (score / 100) * c;
    return (
      <span className="score-wrap">
        <svg className="score-ring" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="3" className="score-ring-track" />
          <circle
            cx="16" cy="16" r={r} fill="none" strokeWidth="3"
            strokeDasharray={c} strokeDashoffset={off}
            transform="rotate(-90 16 16)"
            strokeLinecap="round"
            data-band={band}
            className="score-ring-fill"
          />
        </svg>
        <span className="score-num">{score}</span>
      </span>
    );
  }

  return (
    <span className="score-wrap">
      <span className="score-bar">
        <span className="score-bar-fill" data-band={band} style={{ width: `${score}%` }} />
      </span>
      <span className="score-num">{score}</span>
    </span>
  );
}
