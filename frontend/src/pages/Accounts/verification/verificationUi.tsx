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
  if (score >= 80) return { fg: "var(--good-500)", bg: "rgba(0,255,150,0.08)", border: "rgba(0,255,150,0.25)" };
  if (score >= 60) return { fg: "var(--warn-500)", bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.25)" };
  return { fg: "var(--bad-500)", bg: "rgba(255,70,70,0.08)", border: "rgba(255,70,70,0.25)" };
}

export const statusColors: Record<EmailFinalStatus, { fg: string; bg: string; border: string }> = {
  VALID:     { fg: "var(--good-500)", bg: "rgba(0,255,150,0.08)",  border: "rgba(0,255,150,0.25)"  },
  INVALID:   { fg: "var(--bad-500)",  bg: "rgba(255,70,70,0.08)",  border: "rgba(255,70,70,0.25)"  },
  CATCH_ALL: { fg: "var(--warn-500)", bg: "rgba(255,215,0,0.08)",  border: "rgba(255,215,0,0.25)"  },
  RISKY:     { fg: "var(--warn-500)", bg: "rgba(255,140,0,0.08)",  border: "rgba(255,140,0,0.25)"  },
  NOT_FOUND: { fg: "var(--text-3)",   bg: "rgba(255,255,255,0.04)", border: "var(--border)"         },
};

export const methodColors: Record<ResolutionMethod, { fg: string; bg: string; border: string }> = {
  LINKEDIN_PRIMARY:          { fg: "var(--good-500)", bg: "rgba(0,255,150,0.08)", border: "rgba(0,255,150,0.25)" },
  APOLLO_FALLBACK:           { fg: "var(--text-3)",   bg: "rgba(255,255,255,0.04)", border: "var(--border)" },
  NO_RECONCILIATION_POSSIBLE:{ fg: "var(--warn-500)", bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.25)" },
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
  if (issue.severity === "ERROR") return "var(--bad-500)";
  if (issue.severity === "WARNING") return "var(--warn-500)";
  return "var(--acc-300)";
}

export const sectionCard: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface-1)",
};
