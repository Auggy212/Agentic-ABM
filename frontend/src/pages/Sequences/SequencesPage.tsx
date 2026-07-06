import { useState } from "react";
import Icon from "@/components/ui/Icon";
import Btn from "@/components/ui/Btn";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useSequences } from "@/hooks/useSequences";
import { usePatchSequenceStatus, usePatchStepBody } from "@/hooks/useSequenceMutations";
import { useCopilotPanel } from "@/store/copilotPanelStore";
import type { Sequence, SequenceStep } from "@/types/sequences";

// ── Channel glyphs & colours ─────────────────────────────────────────────────
const CHANNEL_GLYPH: Record<string, string> = { email: "@", linkedin: "in", call: "☎" };
const CHANNEL_LABEL: Record<string, string> = { email: "Email", linkedin: "LinkedIn DM", call: "Call / SMS" };
const REVIEW_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  APPROVED:    { bg: "rgba(0,255,150,0.08)",  fg: "var(--good-500)", label: "Approved"    },
  EDITED:      { bg: "rgba(255,215,0,0.08)", fg: "var(--warn-500)", label: "Edited"      },
  REGENERATED: { bg: "rgba(0,212,255,0.08)", fg: "var(--acc-300)",  label: "Regenerated" },
  REJECTED:    { bg: "rgba(255,70,70,0.08)", fg: "var(--bad-500)",  label: "Rejected"    },
  PAUSED:       { bg: "var(--surface-3)", fg: "var(--text-3)",   label: "Paused" },
  PENDING:      { bg: "var(--surface-2)", fg: "var(--text-3)",   label: "Pending" },
};

// ── Inline Step Editor ────────────────────────────────────────────────────────
function StepEditor({
  step,
  onSave,
  onCancel,
}: {
  step: SequenceStep;
  onSave: (body: string, subject?: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(step.body);
  const [subject, setSubject] = useState(step.title !== step.body ? step.title : "");
  const isEmail = step.channel === "email";

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      {isEmail && (
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          <span style={{ color: "var(--text-2)", fontWeight: 700 }}>Subject line</span>
          <input
            className="abm-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
      )}
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
        <span style={{ color: "var(--text-2)", fontWeight: 700 }}>Body</span>
        <textarea
          className="abm-input"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12 }}
        />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="primary" size="sm" onClick={() => onSave(body, isEmail ? subject : undefined)}>
          Save
        </Btn>
        <Btn variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}

// ── Single step row ───────────────────────────────────────────────────────────
function StepRow({
  step,
  index,
  onRewrite,
}: {
  step: SequenceStep;
  index: number;
  onRewrite: (step: SequenceStep) => void;
}) {
  const [editing, setEditing] = useState(false);
  const patchStep = usePatchStepBody();
  const badge = REVIEW_BADGE[step.review_state ?? "PENDING"] ?? REVIEW_BADGE.PENDING;

  function handleSave(body: string, subject?: string) {
    patchStep.mutate(
      { messageId: step.id, body, subject },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <div className="seq-step" data-channel={step.channel}>
      <div className="seq-step-num">{CHANNEL_GLYPH[step.channel] ?? index + 1}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="seq-step-channel">
          Day {step.day} · {CHANNEL_LABEL[step.channel] ?? step.channel}
          {step.tier && (
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--text-3)" }}>
              {step.tier.replace("_", " ")}
            </span>
          )}
          <span
            style={{
              marginLeft: 8,
              padding: "1px 7px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              background: badge.bg,
              color: badge.fg,
            }}
          >
            {badge.label}
          </span>
        </div>
        <div className="seq-step-title">{step.title}</div>

        {editing ? (
          <StepEditor
            step={step}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div
            className="seq-step-body"
            style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}
          >
            {step.body || <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>No body yet.</span>}
          </div>
        )}
      </div>
      {!editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <Btn
            variant="ghost"
            size="sm"
            icon="sparkle"
            onClick={() => onRewrite(step)}
            title="Ask the copilot to rewrite this step"
          >
            Rewrite
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Btn>
        </div>
      )}
    </div>
  );
}

// ── Sequence detail panel ─────────────────────────────────────────────────────
function SequenceDetail({ seq }: { seq: Sequence }) {
  const openCopilot = useCopilotPanel((s) => s.openCopilot);
  const patchStatus = usePatchSequenceStatus();
  const isPaused = seq.status === "paused";

  function handleRewrite(step: SequenceStep) {
    const prompt = `Rewrite step ${step.day} (${CHANNEL_LABEL[step.channel] ?? step.channel}) for ${seq.name}.\n\nCurrent message:\n${step.title}\n\n${step.body}\n\nPlease keep the same personalization approach but improve the tone, clarity, and call-to-action.`;
    openCopilot(prompt);
  }

  return (
    <div className="seq-detail">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div className="section-eyebrow">
            {seq.status} · {seq.accounts} account{seq.accounts !== 1 ? "s" : ""} · {seq.contacts} contact{seq.contacts !== 1 ? "s" : ""}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              margin: "4px 0 6px",
              letterSpacing: "-0.01em",
            }}
          >
            {seq.name}
          </h2>
          <p style={{ color: "var(--text-3)", fontSize: 13.5, margin: 0, maxWidth: 520 }}>
            {seq.description}
          </p>
        </div>
        <Btn
          variant="ghost"
          size="sm"
          icon={isPaused ? "play" : "pause"}
          disabled={patchStatus.isPending}
          onClick={() =>
            patchStatus.mutate({ domain: seq.id, status: isPaused ? "active" : "paused" })
          }
        >
          {isPaused ? "Resume" : "Pause"}
        </Btn>
        <Btn
          variant="primary"
          size="sm"
          icon="sparkle"
          onClick={() =>
            openCopilot(
              `I want to launch the outreach sequence for ${seq.name}. Help me review it before dispatching — are there any improvements you'd suggest?`,
            )
          }
        >
          Launch with Copilot
        </Btn>
      </div>

      {/* Metrics */}
      {seq.metrics && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            marginBottom: 24,
            background: "var(--border)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {(
            [
              ["Sent", String(seq.metrics.sent)],
              ["Open rate", seq.metrics.opened > 0 ? `${Math.round(seq.metrics.opened * 100)}%` : "—"],
              ["Reply rate", seq.metrics.replied > 0 ? `${Math.round(seq.metrics.replied * 100)}%` : "—"],
              ["Meetings", seq.metrics.meetings > 0 ? String(seq.metrics.meetings) : "—"],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} style={{ background: "var(--surface)", padding: "12px 16px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {k}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 26,
                  fontWeight: 400,
                  marginTop: 2,
                  color: v === "—" ? "var(--text-3)" : undefined,
                }}
              >
                {v}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Steps */}
      {seq.steps && seq.steps.length > 0 ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}
          </div>
          {seq.steps.map((s, i) => (
            <StepRow key={s.id} step={s} index={i} onRewrite={handleRewrite} />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--text-3)",
            border: "1px dashed var(--border-strong)",
            borderRadius: 12,
          }}
        >
          No steps drafted yet.{" "}
          <Btn
            variant="accent"
            size="sm"
            icon="sparkle"
            style={{ marginLeft: 10 }}
            onClick={() =>
              openCopilot(
                `Draft an outreach sequence for ${seq.name}. Create 3–5 steps across email and LinkedIn covering the full buyer journey from awareness to meeting booked.`,
              )
            }
          >
            Draft with Copilot
          </Btn>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SequencesPage() {
  const { data, isLoading, isError } = useSequences();
  const openCopilot = useCopilotPanel((s) => s.openCopilot);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div
        className="page-body"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}
      >
        <LoadingSpinner size="lg" label="Loading sequences" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-body">
        <div
          className="card card-pad"
          style={{ borderColor: "var(--bad-200)", background: "var(--bad-50)" }}
        >
          <p style={{ color: "var(--bad-700)", margin: 0 }}>
            Failed to load sequences. Please retry.
          </p>
        </div>
      </div>
    );
  }

  const { sequences, kpis } = data;
  const resolvedId = activeId ?? sequences[0]?.id ?? null;
  const active = sequences.find((s) => s.id === resolvedId) ?? sequences[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-head-meta">
            Outreach · {sequences.length} sequence{sequences.length !== 1 ? "s" : ""}
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Sequences</h1>
        </div>
        <div className="page-head-actions">
          <Btn
            variant="ghost"
            size="sm"
            icon="sparkle"
            onClick={() =>
              openCopilot(
                `I need help drafting outreach sequences. I have ${sequences.length} account${sequences.length !== 1 ? "s" : ""} to reach. Can you suggest a sequencing strategy and draft the first sequence?`,
              )
            }
          >
            Draft with Copilot
          </Btn>
          <Btn
            variant="primary"
            size="sm"
            icon="plus"
            onClick={() =>
              openCopilot(
                "Create a new outreach sequence from scratch. Ask me which account or segment I want to target.",
              )
            }
          >
            New sequence
          </Btn>
        </div>
      </div>

      <div className="page-body">
        {/* KPI row */}
        <div
          className="kpi-row"
          style={{ gridTemplateColumns: `repeat(${kpis.length}, 1fr)`, marginBottom: 20 }}
        >
          {kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-num">{k.num}</div>
              {k.delta && <div className="kpi-delta">↗ {k.delta}</div>}
            </div>
          ))}
        </div>

        {sequences.length === 0 ? (
          <div
            className="card card-pad"
            style={{ textAlign: "center", color: "var(--text-3)", display: "grid", gap: 12 }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>No sequences yet</div>
            <div style={{ fontSize: 13 }}>
              Sequences are generated automatically once the Storyteller agent has run for an
              approved CP2. You can also ask the Copilot to draft one from scratch.
            </div>
            <div>
              <Btn
                variant="accent"
                size="sm"
                icon="sparkle"
                onClick={() =>
                  openCopilot(
                    "I'd like to draft a new outreach sequence. Can you help me get started?",
                  )
                }
              >
                Draft with Copilot
              </Btn>
            </div>
          </div>
        ) : (
          <div className="sequence-grid">
            {/* Sequence list sidebar */}
            <div className="seq-list">
              <div
                style={{
                  padding: "8px 12px 12px",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {sequences.filter((s) => s.status === "active").length} active
              </div>
              {sequences.map((s) => (
                <div
                  key={s.id}
                  className="seq-list-item"
                  data-active={String(resolvedId === s.id)}
                  onClick={() => setActiveId(s.id)}
                >
                  <div className="seq-list-name">{s.name}</div>
                  <div className="seq-list-meta">
                    {s.accounts} account{s.accounts !== 1 ? "s" : ""} · {s.contacts} contact
                    {s.contacts !== 1 ? "s" : ""} ·{" "}
                    <span
                      style={{
                        color: s.status === "active" ? "var(--good-700)" : "var(--text-3)",
                      }}
                    >
                      {s.status}
                    </span>
                  </div>
                  {s.steps && s.steps.length > 0 && (
                    <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                      {s.steps.length} step{s.steps.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              ))}
              <button
                className="seq-list-item"
                style={{
                  marginTop: 14,
                  color: "var(--text-3)",
                  border: "1px dashed var(--border-strong)",
                  cursor: "pointer",
                }}
                onClick={() =>
                  openCopilot(
                    "Create a new outreach sequence from scratch. Ask me which account or segment I want to target.",
                  )
                }
              >
                <Icon name="plus" size={12} />
                <span style={{ marginLeft: 6 }}>New sequence</span>
              </button>
            </div>

            {/* Sequence detail */}
            {active && <SequenceDetail seq={active} />}
          </div>
        )}
      </div>
    </>
  );
}
