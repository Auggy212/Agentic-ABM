import Icon from "@/components/ui/Icon";
import Btn from "@/components/ui/Btn";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAgents } from "@/hooks/useAgents";
import type { EventTone } from "@/types/agents";

function toneIcon(tone: EventTone): Parameters<typeof Icon>[0]["name"] {
  if (tone === "found")  return "check";
  if (tone === "warn")   return "warn";
  if (tone === "block")  return "ban";
  return "play";
}

export default function AgentsPage() {
  const { data, isLoading, isError } = useAgents();

  if (isLoading) {
    return (
      <div className="page-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <LoadingSpinner size="lg" label="Loading agents" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-body">
        <div className="card card-pad" style={{ borderColor: "var(--bad-200)", background: "var(--bad-50)" }}>
          <p style={{ color: "var(--bad-700)", margin: 0 }}>Failed to load agent data. Please retry.</p>
        </div>
      </div>
    );
  }

  const { agents, events } = data;
  const runningCount = agents.filter((a) => a.status === "running").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-head-meta">Agent activity · live</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Agents</h1>
        </div>
        <div className="page-head-actions">
          <Btn variant="ghost" size="sm" icon="filter">Filter agents</Btn>
          <Btn variant="ghost" size="sm" icon="download">Export log</Btn>
          <Btn variant="primary" size="sm" icon="play">Trigger run</Btn>
        </div>
      </div>

      <div className="page-body">
        {/* Agent fleet cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}>
          {agents.map((a) => (
            <div key={a.id} className="card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "var(--ink-900)", color: "var(--ink-paper)",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  <Icon name={a.icon as Parameters<typeof Icon>[0]["name"]} size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.name}</div>
                  <div style={{
                    fontSize: 11, fontFamily: "var(--font-mono)",
                    color: a.status === "running" ? "var(--good-700)" : "var(--text-3)",
                    textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    <span style={{
                      display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                      background: a.status === "running" ? "var(--good-500)" : "var(--text-3)",
                    }} />
                    {a.status}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 10, lineHeight: 1.4 }}>{a.description}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>{a.runs}</div>
            </div>
          ))}
        </div>

        {/* Activity feed */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{
            padding: "14px 18px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div className="section-eyebrow" style={{ margin: 0 }}>Live activity</div>
            <span style={{
              marginLeft: "auto", fontSize: 11,
              fontFamily: "var(--font-mono)", color: "var(--text-3)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: runningCount > 0 ? "var(--good-500)" : "var(--text-3)",
              }} />
              {runningCount > 0 ? `streaming · ${runningCount} agents active` : "idle"}
            </span>
          </div>

          {events.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              No activity yet. Trigger a run to start.
            </div>
          ) : (
            <div className="agent-feed">
              {events.map((e) => (
                <div key={e.id} className="agent-event" data-tone={e.tone}>
                  <div className="agent-event-time">{e.time}</div>
                  <div className="agent-event-icon">
                    <Icon name={toneIcon(e.tone)} size={13} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="agent-event-title">
                      <strong>{e.agent}</strong> · {e.title}
                    </div>
                    <div className="agent-event-meta">{e.meta}</div>
                  </div>
                  <div className="agent-event-stat">{e.stat}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
