import type { ReactNode } from "react";
import Button from "./Button";

/**
 * Empty-state panel with optional primary action for user recovery.
 */
export interface EmptyStateProps {
  icon: ReactNode;
  heading: string;
  subtext: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, heading, subtext, action }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <div className="mb-3 text-3xl text-slate-500">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900">{heading}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtext}</p>
      {action ? (
        <div className="mt-5">
          <Button onClick={action.onClick} variant="primary" size="md">
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
