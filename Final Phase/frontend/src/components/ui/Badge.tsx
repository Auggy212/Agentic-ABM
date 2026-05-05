type BadgeVariant =
  | "tier1"
  | "tier2"
  | "tier3"
  | "valid"
  | "invalid"
  | "catch-all"
  | "high"
  | "medium"
  | "low"
  | "decision-maker"
  | "champion"
  | "blocker"
  | "influencer";

const variantClasses: Record<BadgeVariant, string> = {
  tier1: "bg-green-100 text-green-800",
  tier2: "bg-amber-100 text-amber-800",
  tier3: "bg-red-100 text-red-800",
  valid: "bg-green-100 text-green-800",
  invalid: "bg-red-100 text-red-800",
  "catch-all": "bg-orange-100 text-orange-800",
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-50 text-gray-600",
  "decision-maker": "bg-blue-100 text-blue-800",
  champion: "bg-green-100 text-green-800",
  blocker: "bg-red-100 text-red-800",
  influencer: "bg-yellow-100 text-yellow-800"
};

/**
 * Compact status/tag badge for ABM scoring, persona roles, and validation states.
 */
export interface BadgeProps {
  label: string;
  variant: BadgeVariant;
}

export function Badge({ label, variant }: BadgeProps) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${variantClasses[variant]}`}>{label}</span>;
}

export default Badge;
