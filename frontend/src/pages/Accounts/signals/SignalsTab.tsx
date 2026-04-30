import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useSignalsByAccount, useRegenerateIntel } from "./hooks";
import SignalTimeline from "./SignalTimeline";
import SignalScoreCard from "./SignalScoreCard";
import IntelReportPanel from "./IntelReportPanel";
import type { BuyingStage, BuyingStageMethod } from "./types";

// ── Buying stage indicator ────────────────────────────────────────────────────

const STAGES: BuyingStage[] = [
  "UNAWARE",
  "PROBLEM_AWARE",
  "SOLUTION_AWARE",
  "EVALUATING",
  "READY_TO_BUY",
];

const STAGE_LABELS: Record<BuyingStage, string> = {
  UNAWARE: "Unaware",
  PROBLEM_AWARE: "Problem Aware",
  SOLUTION_AWARE: "Solution Aware",
  EVALUATING: "Evaluating",
  READY_TO_BUY: "Ready to Buy",
};

const STAGE_COLORS: Record<BuyingStage, { active: string; dim: string }> = {
  UNAWARE: { active: "#6b7280", dim: "#f3f4f6" },
  PROBLEM_AWARE: { active: "#b45309", dim: "#fffbeb" },
  SOLUTION_AWARE: { active: "#0369a1", dim: "#eff6ff" },
  EVALUATING: { active: "#7c3aed", dim: "#f5f3ff" },
  READY_TO_BUY: { active: "#15803d", dim: "#f0fdf4" },
};

function BuyingStageIndicator({
  stage,
  method,
  reasoning,
}: {
  stage: BuyingStage;
  method: BuyingStageMethod;
  reasoning: string;
}) {
  const activeIdx = STAGES.indexOf(stage);
  const colors = STAGE_COLORS[stage];

  return (
    <div
      className="card card-pad"
      style={{ textAlign: "center" }}
    >
      <div className="section-eyebrow">Buying stage</div>

      {/* Progress bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          margin: "16px 0 8px",
          alignItems: "center",
        }}
      >
        {STAGES.map((s, idx) => {
          const isActive = s === stage;
          const isPast = idx < activeIdx;
          const stageColors = STAGE_COLORS[s];

          return (
            <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  height: 8,
                  width: "100%",
                  borderRadius: 4,
                  background: isActive
                    ? stageColors.active
                    : isPast
                    ? stageColors.active + "60"
                    : "var(--border)",
                  transition: "background 0.3s",
                }}
              />
              <div
                style={{
                  fontSize: 9,
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? stageColors.active : "var(--text-3)",
                  whiteSpace: "nowrap",
                }}
              >
                {STAGE_LABELS[s]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active stage label */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "var(--font-display)",
          color: colors.active,
          margin: "12px 0 4px",
        }}
      >
        {STAGE_LABELS[stage]}
      </div>

      {/* Method badge */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <span
          title={reasoning}
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: 10,
            background: method === "LLM_TIEBREAKER" ? "#f5f3ff" : "var(--surface-2)",
            color: method === "LLM_TIEBREAKER" ? "#7c3aed" : "var(--text-3)",
            border: method === "LLM_TIEBREAKER" ? "1px solid #c4b5fd" : "1px solid var(--border)",
            cursor: "help",
          }}
        >
          Classified by {method === "LLM_TIEBREAKER" ? "LLM Tiebreaker" : "Rules"}
        </span>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

interface Props {
  domain: string;
}

export default function SignalsTab({ domain }: Props) {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id") ?? "";
  const { data, isLoading, isError } = useSignalsByAccount(domain);
  const regenerate = useRegenerateIntel(domain);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 240,
        }}
      >
        <LoadingSpinner size="lg" label="Loading signal intelligence…" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "var(--text-3)",
          fontSize: 13,
          background: "var(--surface-2)",
          borderRadius: 10,
          border: "1px dashed var(--border)",
        }}
      >
        Signal intelligence not yet run for this account.
        <br />
        <br />
        Trigger a run from the{" "}
        <a href="/pipeline" style={{ color: "var(--acc-600)" }}>
          Pipeline page
        </a>
        .
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Buying stage indicator */}
      <BuyingStageIndicator
        stage={data.buying_stage}
        method={data.buying_stage_method}
        reasoning={data.buying_stage_reasoning}
      />

      {/* Outreach approach */}
      <div
        className="card card-pad"
        style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}
      >
        <div className="section-eyebrow" style={{ marginBottom: 6 }}>
          Recommended outreach approach
        </div>
        {data.recommended_outreach_approach}
      </div>

      {/* Signals + score side by side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 200px",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div className="card card-pad">
          <div className="section-eyebrow" style={{ marginBottom: 12 }}>
            Signal timeline · {data.signals.length} signal{data.signals.length !== 1 ? "s" : ""}
          </div>
          {data.signals.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: 13,
                background: "var(--surface-2)",
                borderRadius: 8,
              }}
            >
              No signals detected for this account yet.
            </div>
          ) : (
            <SignalTimeline signals={data.signals} />
          )}
        </div>

        <SignalScoreCard score={data.signal_score} />
      </div>

      {/* Account intel report */}
      <div className="card card-pad">
        <div className="section-eyebrow" style={{ marginBottom: 12 }}>
          Account Intelligence Report
          {data.tier === "TIER_1" && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                background: "#eff6ff",
                color: "#1d4ed8",
                border: "1px solid #bfdbfe",
              }}
            >
              Tier 1
            </span>
          )}
        </div>
        <IntelReportPanel
          tier={data.tier}
          intelReport={data.intel_report}
          onGenerate={() => regenerate.mutate(clientId)}
          onRegenerate={() => regenerate.mutate(clientId)}
          isGenerating={regenerate.isPending}
        />
      </div>
    </div>
  );
}
