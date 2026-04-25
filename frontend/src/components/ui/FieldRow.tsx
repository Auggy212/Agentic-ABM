import Tooltip from "./Tooltip";
import { cn } from "@/lib/utils";

interface FieldRowProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  example?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export default function FieldRow({
  label,
  htmlFor,
  required,
  example,
  hint,
  error,
  children,
  className,
}: FieldRowProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <label htmlFor={htmlFor} className="form-label mb-0">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {example && (
          <Tooltip content={`Example: ${example}`}>
            <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-gray-200 text-gray-500 text-xs cursor-help font-semibold hover:bg-gray-300 transition">
              ?
            </span>
          </Tooltip>
        )}
      </div>
      {children}
      {hint && !error && <p className="form-hint">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
