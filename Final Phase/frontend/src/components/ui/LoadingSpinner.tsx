import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

export default function LoadingSpinner({ size = "md", className, label = "Loading…" }: LoadingSpinnerProps) {
  const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10" };

  return (
    <div className={cn("flex items-center justify-center gap-2", className)} role="status" aria-label={label}>
      <svg
        className={cn("animate-spin text-brand-600", sizes[size])}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}
