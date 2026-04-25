import { useState } from "react";
import Icon from "@/components/ui/Icon";
import Btn from "@/components/ui/Btn";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useSequences } from "@/hooks/useSequences";

const CHANNEL_GLYPH: Record<string, string> = { email: "@", linkedin: "in", call: "☎" };

export default function SequencesPage() {
  const { data, isLoading, isError } = useSequences();
  const [activeId, setActiveId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="page-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <LoadingSpinner size="lg" label="Loading sequences" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-body">
        <div className="card card-pad" style={{ borderColor: "var(--bad-200)", background: "var(--bad-50)" }}>
          <p style={{ color: "var(--bad-700)", margin: 0 }}>Failed to load sequences. Please retry.</p>
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
          <div className="page-head-meta">Outreach · {sequences.length} sequence{sequences.length !== 1 ? "s" : ""}</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Sequences</h1>
        </div>
        <div className="page-head-actions">
          <Btn variant="ghost" size="sm" icon="sparkle">Draft with copilot</Btn>
          <Btn variant="primary" size="sm" icon="plus">New sequence</Btn>
        </div>
      </div>

      <div className="page-body">
        {/* KPI row — data from API */}
        <div className="kpi-row" style={{ gridTemplateColumns: `repeat(${kpis.length}, 1fr)`, marginBottom: 20 }}>
          {kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-num">{k.num}</div>
              <div className="kpi-delta">↗ {k.delta}</div>
            </div>
          ))}
        </div>

        {sequences.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
            No sequences yet.{" "}
            <Btn variant="accent" size="sm" icon="sparkle" style={{ marginLeft: 8 }}>Draft with copilot</Btn>
          </div>
        ) : (
          <div className="sequence-grid">
            {/* Sequence list */}
            <div className="seq-list">
              <div style={{
                padding: "8px 12px 12px",
                fontSize: 11, fontFamily: "var(--font-mono)",
                color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
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
                    {s.accounts} accounts · {s.contacts} contacts · {s.status}
                  </div>
                </div>
              ))}
              <button
                className="seq-list-item"
                style={{ marginTop: 14, color: "var(--text-3)", border: "1px dashed var(--border-strong)" }}
              >
                <Icon name="plus" size={12} />
                <span style={{ marginLeft: 6 }}>New sequence</span>
              </button>
            </div>

            {/* Sequence detail */}
            {active && (
              <div className="seq-detail">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div className="section-eyebrow">{active.status} · {active.accounts} accounts</div>
                    <h2 style={{
                      fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 400,
                      margin: "4px 0 6px", letterSpacing: "-0.01em",
                    }}>
                      {active.name}
                    </h2>
                    <p style={{ color: "var(--text-3)", fontSize: 13.5, margin: 0, maxWidth: 520 }}>
                      {active.description}
                    </p>
                  </div>
                  <Btn variant="ghost" size="sm" icon="pause">Pause</Btn>
                  <Btn variant="primary" size="sm" icon="play">Launch enrolled</Btn>
                </div>

                {/* Metrics from data */}
                {active.metrics && (
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 1, marginBottom: 24,
                    background: "var(--border)", border: "1px solid var(--border)",
                    borderRadius: 12, overflow: "hidden",
                  }}>
                    {([
                      ["Sent",       String(active.metrics.sent)],
                      ["Open rate",  `${Math.round(active.metrics.opened * 100)}%`],
                      ["Reply rate", `${Math.round(active.metrics.replied * 100)}%`],
                      ["Meetings",   String(active.metrics.meetings)],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{ background: "var(--surface)", padding: "12px 16px" }}>
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 10.5,
                          color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em",
                        }}>{k}</div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400, marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Steps from data */}
                {active.steps && active.steps.length > 0 ? (
                  active.steps.map((s, i) => (
                    <div key={s.id} className="seq-step" data-channel={s.channel}>
                      <div className="seq-step-num">{CHANNEL_GLYPH[s.channel] ?? i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="seq-step-channel">Day {s.day} · {s.channel}</div>
                        <div className="seq-step-title">{s.title}</div>
                        <div className="seq-step-body">{s.body}</div>
                        {s.stats && Object.keys(s.stats).length > 0 && (
                          <div className="seq-step-stats">
                            {Object.entries(s.stats).map(([k, v]) => (
                              <span key={k}>{k}: <strong>{v}</strong></span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                        <Btn variant="ghost" size="sm" icon="sparkle">Rewrite</Btn>
                        <Btn variant="ghost" size="sm">Edit</Btn>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{
                    padding: 40, textAlign: "center", color: "var(--text-3)",
                    border: "1px dashed var(--border-strong)", borderRadius: 12,
                  }}>
                    No steps drafted yet.{" "}
                    <Btn variant="accent" size="sm" icon="sparkle" style={{ marginLeft: 10 }}>
                      Draft with copilot
                    </Btn>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
