import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonExtendedProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const base = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const variants = {
  primary:   "bg-brand-primary text-white hover:bg-brand-accent focus:ring-brand-primary",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-brand-primary",
  ghost:     "text-slate-600 hover:bg-slate-100 focus:ring-brand-primary",
  danger:    "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
};

const sizes = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-5 py-2.5",
};

export const ButtonExtended = forwardRef<HTMLButtonElement, ButtonExtendedProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, label, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
        {label ?? children}
      </button>
    );
  }
);

ButtonExtended.displayName = "Button";
