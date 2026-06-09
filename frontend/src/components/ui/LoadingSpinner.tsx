interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  /** Renders as a full-page backdrop overlay */
  fullPage?: boolean;
  className?: string;
}

function OrbitalRings({ size = "md", label }: { size?: "sm" | "md" | "lg"; label?: string }) {
  return (
    <div className="abm-loader" data-size={size} role="status" aria-label={label ?? "Loading"}>
      <div className="abm-loader-rings">
        <div className="abm-loader-ring abm-loader-ring-1" />
        <div className="abm-loader-ring abm-loader-ring-2" />
        <div className="abm-loader-ring abm-loader-ring-3" />
        <div className="abm-loader-core" />
      </div>
      {label && <div className="abm-loader-label">{label}</div>}
    </div>
  );
}

export default function LoadingSpinner({ size = "md", label, fullPage = false, className }: LoadingSpinnerProps) {
  if (fullPage) {
    return (
      <div className="abm-loader-overlay">
        <OrbitalRings size="lg" label={label ?? "Loading…"} />
      </div>
    );
  }

  return (
    <div className={className} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <OrbitalRings size={size} label={label} />
    </div>
  );
}
