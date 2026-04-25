import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { AccountRecord, AccountTier, DataSource, ScoreBreakdown } from "./types";

const SOURCE_META: Record<DataSource, { label: string; className: string; glyph: string }> = {
  APOLLO: { label: "Apollo", className: "bg-sky-50 text-sky-700 border-sky-200", glyph: "A" },
  HARMONIC: { label: "Harmonic", className: "bg-violet-50 text-violet-700 border-violet-200", glyph: "H" },
  CRUNCHBASE: { label: "Crunchbase", className: "bg-indigo-50 text-indigo-700 border-indigo-200", glyph: "C" },
  BUILTWITH: { label: "BuiltWith", className: "bg-orange-50 text-orange-700 border-orange-200", glyph: "B" },
  CLIENT_UPLOAD: { label: "Upload", className: "bg-slate-100 text-slate-700 border-slate-200", glyph: "U" },
};

const TIER_META: Record<AccountTier, { label: string; className: string }> = {
  TIER_1: { label: "Tier 1", className: "bg-emerald-500 text-white shadow-sm shadow-emerald-200" },
  TIER_2: { label: "Tier 2", className: "bg-amber-400 text-amber-950 shadow-sm shadow-amber-200" },
  TIER_3: { label: "Tier 3", className: "bg-slate-200 text-slate-700" },
};

export const SCORE_DIMENSIONS: Array<{
  key: keyof ScoreBreakdown;
  label: string;
  max: number;
}> = [
  { key: "industry", label: "Industry", max: 25 },
  { key: "company_size", label: "Size", max: 20 },
  { key: "geography", label: "Geo", max: 15 },
  { key: "tech_stack", label: "Tech stack", max: 20 },
  { key: "funding_stage", label: "Funding", max: 10 },
  { key: "buying_triggers", label: "Triggers", max: 10 },
];

export function TierBadge({ tier, className }: { tier: AccountTier; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[5.25rem] items-center justify-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
        TIER_META[tier].className,
        className
      )}
    >
      {TIER_META[tier].label}
    </span>
  );
}

export function ScoreBar({ score, compact = false }: { score: number; compact?: boolean }) {
  const tone =
    score >= 80
      ? "from-emerald-500 to-emerald-400"
      : score >= 60
        ? "from-amber-500 to-amber-300"
        : "from-slate-500 to-slate-400";

  return (
    <div className={cn("w-full", compact ? "max-w-[8rem]" : "")}>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-600">
        <span>{score}</span>
        <span>/ 100</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all", tone)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export function SourceBadge({ source }: { source: DataSource }) {
  const meta = SOURCE_META[source];

  return (
    <Badge variant="default" className={cn("gap-2 border", meta.className)}>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold">
        {meta.glyph}
      </span>
      {meta.label}
    </Badge>
  );
}

export function formatHeadcount(headcount: AccountRecord["headcount"]) {
  if (headcount === "not_found") {
    return "Not found";
  }
  return new Intl.NumberFormat("en-US").format(headcount);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
