import { forwardRef } from "react";
import Icon from "./Icon";

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "ghost" | "danger-ghost" | "";
  size?: "sm" | "md";
  icon?: string;
  loading?: boolean;
}

const Btn = forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant = "", size, icon, loading, disabled, children, className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`btn${size === "sm" ? " btn-sm" : ""} ${className}`}
      data-variant={variant}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin" width={13} height={13} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {icon && !loading && <Icon name={icon} size={13} />}
      {children}
    </button>
  )
);
Btn.displayName = "Btn";
export default Btn;
