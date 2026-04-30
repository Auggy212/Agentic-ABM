import { useState } from "react";
import Btn from "@/components/ui/Btn";
import ClaimTag from "./ClaimTag";
import type { AccountTier, IntelReport } from "./types";

// ── Accordion section ─────────────────────────────────────────────────────────

function AccordionSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "var(--surface-2)",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-1)",
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "12px 16px" }}>{children}</div>
      )}
    </div>
  );
}

// ── Intel report footer ───────────────────────────────────────────────────────

function IntelReportFooter({
  generatedAt,
  generatedBy,
  onRegenerate,
  isRegenerating,
}: {
  generatedAt: string;
  generatedBy: { researcher: string; synthesizer: string };
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        background: "var(--surface-2)",
        borderRadius: 8,
        marginTop: 12,
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
        Researched by{" "}
        <strong style={{ color: "var(--text-2)" }}>{generatedBy.researcher}</strong> · Synthesized
        by <strong style={{ color: "var(--text-2)" }}>{generatedBy.synthesizer}</strong> · Generated{" "}
        {new Date(generatedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </div>
      {onRegenerate && (
        <Btn size="sm" variant="ghost" loading={isRegenerating} onClick={onRegenerate}>
          Regenerate report →
        </Btn>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  tier: AccountTier;
  intelReport: IntelReport | null;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  isGenerating?: boolean;
}

export default function IntelReportPanel({
  tier,
  intelReport,
  onGenerate,
  onRegenerate,
  isGenerating,
}: Props) {
  if (tier !== "TIER_1") {
    const tierNum = tier.replace("TIER_", "");
    return (
      <div
        style={{
          padding: "24px 20px",
          textAlign: "center",
          color: "var(--text-3)",
          fontSize: 13,
          background: "var(--surface-2)",
          borderRadius: 10,
          border: "1px dashed var(--border)",
          lineHeight: 1.6,
        }}
      >
        Account Intelligence Reports are generated for Tier 1 accounts only.
        <br />
        This account is <strong>Tier {tierNum}</strong> — upgrade its ICP score to 80+ to unlock
        deep intelligence.
      </div>
    );
  }

  if (!intelReport) {
    return (
      <div
        style={{
          padding: "32px 20px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          background: "var(--surface-2)",
          borderRadius: 10,
          border: "1px dashed var(--border)",
        }}
      >
        <div style={{ fontSize: 32 }}>🔍</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
            Intel report not yet generated
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            This Tier 1 account hasn&apos;t been researched yet.
          </div>
        </div>
        <Btn variant="accent" size="sm" loading={isGenerating} onClick={onGenerate}>
          Generate now →
        </Btn>
      </div>
    );
  }

  const report = intelReport;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Company snapshot */}
      <AccordionSection title="Company snapshot" defaultOpen>
        <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.7, margin: 0 }}>
          {report.company_snapshot}
        </p>
      </AccordionSection>

      {/* Strategic priorities */}
      <AccordionSection title="Strategic priorities" defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {report.strategic_priorities.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-3)",
                  minWidth: 18,
                  paddingTop: 1,
                }}
              >
                {i + 1}.
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <ClaimTag status={item.evidence_status} sourceUrl={item.source_url} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>
                    {item.priority}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                  {item.evidence}
                </div>
              </div>
            </div>
          ))}
        </div>
      </AccordionSection>

      {/* Tech stack */}
      <AccordionSection title="Tech stack">
        {report.tech_stack.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--text-3)" }}>No tech stack data available.</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {report.tech_stack.map((tech) => (
              <span key={tech} className="cell-tech-pill" style={{ padding: "4px 9px", fontSize: 12 }}>
                {tech}
              </span>
            ))}
          </div>
        )}
      </AccordionSection>

      {/* Competitive landscape */}
      <AccordionSection title="Competitive landscape">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {report.competitive_landscape.map((item, i) => (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <ClaimTag status={item.evidence_status} sourceUrl={item.source_url} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>
                  {item.competitor_name}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                {item.evidence}
              </div>
            </div>
          ))}
        </div>
      </AccordionSection>

      {/* Inferred pain points */}
      <AccordionSection title="Inferred pain points">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {report.inferred_pain_points.map((item, i) => (
            <div
              key={i}
              style={{
                padding: "8px 12px",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <ClaimTag status="INFERRED" />
                <span style={{ fontWeight: 500, color: "var(--text-1)" }}>{item.pain_point}</span>
              </div>
              <div style={{ color: "var(--text-2)", lineHeight: 1.4 }}>{item.reasoning}</div>
            </div>
          ))}
        </div>
      </AccordionSection>

      {/* Recent news */}
      <AccordionSection title="Recent news (top 3)">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {report.recent_news.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--text-3)", minWidth: 70, flexShrink: 0, paddingTop: 1 }}>
                {item.date}
              </span>
              <div>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--acc-600)",
                    textDecoration: "none",
                    lineHeight: 1.3,
                  }}
                >
                  {item.headline} ↗
                </a>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 3 }}>{item.summary}</div>
              </div>
            </div>
          ))}
        </div>
      </AccordionSection>

      {/* Buying committee summary */}
      <AccordionSection title="Buying committee summary">
        <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.6, margin: 0 }}>
          {report.buying_committee_summary}
        </p>
      </AccordionSection>

      {/* Recommended angle — highlighted callout */}
      <div
        style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
          borderRadius: 10,
          border: "1px solid #bfdbfe",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#1d4ed8",
            marginBottom: 8,
          }}
        >
          Recommended angle
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-1)",
            lineHeight: 1.6,
            fontStyle: "italic",
          }}
        >
          &ldquo;{report.recommended_angle}&rdquo;
        </div>
      </div>

      <IntelReportFooter
        generatedAt={report.generated_at}
        generatedBy={report.generated_by}
        onRegenerate={onRegenerate}
        isRegenerating={isGenerating}
      />
    </div>
  );
}
