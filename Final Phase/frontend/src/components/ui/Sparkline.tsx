interface SparklineProps {
  data?: number[];
  color?: string;
}

export default function Sparkline({ data = [3, 5, 4, 7, 6, 9, 8, 11, 10, 14], color }: SparklineProps) {
  const w = 60, h = 18;
  const max = Math.max(...data);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={points} fill="none" stroke={color ?? "var(--acc-500)"} strokeWidth="1.5" />
    </svg>
  );
}
