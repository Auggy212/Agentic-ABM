interface LogoProps {
  mark: string;
  color?: string;
  fg?: string;
  size?: number;
}

const PALETTE = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"];

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function Logo({ mark, color, fg = "#fff", size = 26 }: LogoProps) {
  const bg = color ?? hashColor(mark);
  return (
    <span
      className="cell-logo"
      style={{
        background: bg,
        color: fg,
        width: size,
        height: size,
        fontSize: size * 0.42,
        borderRadius: 6,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        letterSpacing: "-0.04em",
        flexShrink: 0,
      }}
    >
      {mark}
    </span>
  );
}
