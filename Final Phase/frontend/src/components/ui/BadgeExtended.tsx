import React from "react";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "tier1"
  | "tier2"
  | "tier3";

interface BadgeProps {
  label?: string;
  children?: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-green-50 text-green-700 border border-green-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger:  "bg-red-50 text-red-700 border border-red-200",
  info:    "bg-blue-50 text-blue-700 border border-blue-200",
  tier1:   "bg-green-100 text-green-800 border border-green-200",
  tier2:   "bg-amber-100 text-amber-800 border border-amber-200",
  tier3:   "bg-slate-100 text-slate-700 border border-slate-200",
};

export function Badge({ label, children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {label ?? children}
    </span>
  );
}
