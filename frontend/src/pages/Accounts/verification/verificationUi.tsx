import type { CSSProperties, ReactNode } from "react";
import type { EmailFinalStatus, ResolutionMethod, VerificationIssue } from "./types";

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "never";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    apollo: "Apollo",
    hunter: "Hunter",
    clay: "Clay",
    linkedin_manual: "LinkedIn manual",
  };
  return labels[source] ?? source;
}

export function qualityColors(score: number) {
  if (score >= 80) return { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" };
  if (score >= 60) return { fg: "#b45309", bg: "#fffbeb", border: "#fde68a" };
  return { fg: "#b91c1c", bg: "#fef2f2", border: "#fecaca" };
}

export const statusColors: Record<EmailFinalStatus, { fg: string; bg: string; border: string }> = {
  VALID: { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  INVALID: { fg: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  CATCH_ALL: { fg: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  RISKY: { fg: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  NOT_FOUND: { fg: "#475569", bg: "#f8fafc", border: "#e2e8f0" },
};

export const methodColors: Record<ResolutionMethod, { fg: string; bg: string; border: string }> = {
  LINKEDIN_PRIMARY: { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  APOLLO_FALLBACK: { fg: "#475569", bg: "#f8fafc", border: "#e2e8f0" },
  NO_RECONCILIATION_POSSIBLE: { fg: "#b45309", bg: "#fffbeb", border: "#fde68a" },
};

export function Pill({
  children,
  colors,
  title,
}: {
  children: ReactNode;
  colors: { fg: string; bg: string; border: string };
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function issueColor(issue: VerificationIssue) {
  if (issue.severity === "ERROR") return "#b91c1c";
  if (issue.severity === "WARNING") return "#b45309";
  return "#0369a1";
}

export const sectionCard: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface-1)",
};
