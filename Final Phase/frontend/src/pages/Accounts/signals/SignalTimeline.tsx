import { useState } from "react";
import type { AccountSignal, IntentLevel, SignalSource } from "./types";

// ── Intent styling ────────────────────────────────────────────────────────────

const INTENT_CONFIG: Record<IntentLevel, { label: string; color: string; bg: string; border: string }> = {
  HIGH: { label: "High", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  MEDIUM: { label: "Medium", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  LOW: { label: "Low", color: "var(--text-3)", bg: "var(--surface-2)", border: "var(--border)" },
};

// ── Source icons / labels ─────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<SignalSource, { label: string; icon: string }> = {
  LINKEDIN_JOBS: { label: "LinkedIn", icon: "🔗" },
  GOOGLE_NEWS: { label: "Google News", icon: "📰" },
  G2: { label: "G2", icon: "⭐" },
  CRUNCHBASE: { label: "Crunchbase", icon: "💰" },
  REDDIT: { label: "Reddit", icon: "🟠" },
};

const TYPE_LABELS: Record<string, string> = {
  COMPETITOR_REVIEW: "Competitor Review",
  RELEVANT_HIRE: "Relevant Hire",
  FUNDING: "Funding Round",
  LEADERSHIP_HIRE: "Leadership Hire",
  EXPANSION: "Expansion",
  EXEC_CONTENT: "Exec Content",
  WEBINAR_ATTENDED: "Webinar",
  COMPETITOR_ENGAGEMENT: "Competitor Engagement",
  LEADERSHIP_CHANGE: "Leadership Change",
  ICP_MATCH_NO_SIGNAL: "ICP Match",
  INDUSTRY_EVENT: "Industry Event",
  COMPETITOR_FOLLOW: "Competitor Follow",
};

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Signal entry ──────────────────────────────────────────────────────────────

function SignalEntry({ signal }: { signal: AccountSignal }) {
  const [snippetOpen, setSnippetOpen] = useState(false);
  const intent = INTENT_CONFIG[signal.intent_level];
  const source = SOURCE_CONFIG[signal.source];

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--surface-1)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 10,
                background: intent.bg,
                color: intent.color,
                border: `1px solid ${intent.border}`,
              }}
            >
              {intent.label}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
              {TYPE_LABELS[signal.type] ?? signal.type.replace(/_/g, " ")}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.4 }}>
            {signal.description}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div
            style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}
            title={absoluteTime(signal.detected_at)}
          >
            {relativeTime(signal.detected_at)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            {absoluteTime(signal.detected_at)}
          </div>
        </div>
      </div>

      {/* Source + snippet */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <a
          href={signal.source_url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--acc-600)",
            textDecoration: "none",
          }}
        >
          <span>{source.icon}</span>
          <span>{source.label}</span>
          <span>↗</span>
        </a>
        <button
          onClick={() => setSnippetOpen((v) => !v)}
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {snippetOpen ? "Hide evidence ▲" : "Show evidence ▼"}
        </button>
      </div>

      {snippetOpen && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-2)",
            background: "var(--surface-2)",
            padding: "8px 12px",
            borderRadius: 6,
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          {signal.evidence_snippet}
        </div>
      )}
    </div>
  );
}

// ── Main timeline ─────────────────────────────────────────────────────────────

type IntentFilter = "ALL" | IntentLevel;
type SourceFilter = "ALL" | SignalSource;

interface Props {
  signals: AccountSignal[];
}

export default function SignalTimeline({ signals }: Props) {
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");

  const sorted = [...signals].sort(
    (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
  );

  const filtered = sorted.filter((s) => {
    if (intentFilter !== "ALL" && s.intent_level !== intentFilter) return false;
    if (sourceFilter !== "ALL" && s.source !== sourceFilter) return false;
    return true;
  });

  const allSources = Array.from(new Set(signals.map((s) => s.source)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(["ALL", "HIGH", "MEDIUM", "LOW"] as IntentFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setIntentFilter(f)}
            style={{
              padding: "4px 12px",
              borderRadius: 14,
              fontSize: 12,
              fontWeight: intentFilter === f ? 700 : 500,
              border: `1px solid ${intentFilter === f ? "var(--acc-600)" : "var(--border)"}`,
              background: intentFilter === f ? "var(--acc-50)" : "transparent",
              color: intentFilter === f ? "var(--acc-700)" : "var(--text-2)",
              cursor: "pointer",
            }}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface-1)",
              color: "var(--text-1)",
            }}
          >
            <option value="ALL">All sources</option>
            {allSources.map((s) => (
              <option key={s} value={s}>
                {SOURCE_CONFIG[s]?.label ?? s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-3)",
            fontSize: 13,
            background: "var(--surface-2)",
            borderRadius: 8,
            border: "1px dashed var(--border)",
          }}
        >
          No signals match the current filter.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((s) => (
            <SignalEntry key={s.signal_id} signal={s} />
          ))}
        </div>
      )}
    </div>
  );
}
