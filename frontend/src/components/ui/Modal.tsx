import type { PropsWithChildren } from "react";

type ModalSize = "sm" | "md" | "lg";

/**
 * Accessible modal wrapper with overlay dismiss and size variants.
 */
export interface ModalProps extends PropsWithChildren {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size: ModalSize;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl"
};

export function Modal({ isOpen, onClose, title, children, size }: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-50 min-h-screen w-full bg-slate-950/50 px-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div
          className={`w-full rounded-xl bg-white p-5 shadow-lg ${sizeClasses[size]}`}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button type="button" className="text-lg text-slate-500 hover:text-slate-700" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
        </div>
      </div>
    </div>
  );
}
