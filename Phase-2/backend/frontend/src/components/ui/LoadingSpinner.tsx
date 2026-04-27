type SpinnerSize = "sm" | "md" | "lg";

/**
 * Reusable ring spinner with optional label for async UI states.
 */
export interface LoadingSpinnerProps {
  size: SpinnerSize;
  label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]"
};

export function LoadingSpinner({ size, label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`animate-spin rounded-full border-brand-light border-t-brand-accent ${sizeClasses[size]}`} />
      {label ? <span className="text-xs text-slate-500">{label}</span> : null}
    </div>
  );
}
