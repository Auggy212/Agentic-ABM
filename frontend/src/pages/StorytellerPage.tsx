import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Btn from "@/components/ui/Btn";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type { Message } from "./Checkpoint3/types";
import { CHANNEL_LABEL, DEFAULT_CP3_CLIENT_ID } from "./Checkpoint3/types";

interface StorytellerResponse {
  client_id: string;
  messages: Message[];
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

export function StorytellerPage() {
  const [params] = useSearchParams();
  const clientId = params.get("client_id") || DEFAULT_CP3_CLIENT_ID;
  const query = useQuery({
    queryKey: ["storyteller-output", clientId],
    queryFn: async () => {
      const { data } = await api.get<StorytellerResponse>("/api/storyteller/messages", {
        params: { client_id: clientId },
      });
      return data;
    },
  });

  const messages = query.data?.messages || [];
  const byChannel = messages.reduce<Record<string, number>>((acc, message) => {
    acc[message.channel] = (acc[message.channel] || 0) + 1;
    return acc;
  }, {});
  const byTier = messages.reduce<Record<string, number>>((acc, message) => {
    acc[message.tier] = (acc[message.tier] || 0) + 1;
    return acc;
  }, {});
  const costs = messages.reduce(
    (acc, message) => {
      const cost = message.generation_metadata?.token_usage.estimated_cost_usd || 0;
      if (message.generation_metadata?.engine === "ANTHROPIC_CLAUDE") acc.claude += cost;
      else acc.gpt += cost;
      return acc;
    },
    { claude: 0, gpt: 0 },
  );
  const tracePassed = messages.filter((message) => message.validation_state.traceability === "PASSED").length;
  const soft = messages.filter((message) => message.validation_state.traceability === "SOFT_FAIL").length;
  const hard = messages.filter((message) => message.validation_state.traceability === "HARD_FAIL").length;
  const diversityCollisions = messages.filter((message) => message.validation_state.diversity === "FAILED").length;

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>Storyteller Output</h1>
        <div className="page-head-meta">Phase 4 generated messaging package</div>
        <div className="page-head-actions">
          <Link to={`/checkpoint-3?client_id=${clientId}`}><Btn variant="primary">Open CP3 Review</Btn></Link>
        </div>
      </div>
      <div className="page-body" style={{ display: "grid", gap: 18 }}>
        {query.isLoading ? (
          <div style={{ display: "grid", placeItems: "center", minHeight: 300 }}><LoadingSpinner size="lg" label="Loading Storyteller output" /></div>
        ) : (
          <>
            <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
              <div className="kpi"><div className="kpi-label">Messages</div><div className="kpi-num">{messages.length}</div></div>
              <div className="kpi"><div className="kpi-label">Traceability</div><div className="kpi-num">{tracePassed}</div><div className="kpi-delta">{soft} soft · {hard} hard</div></div>
              <div className="kpi"><div className="kpi-label">Diversity</div><div className="kpi-num">{messages.length - diversityCollisions}</div><div className="kpi-delta">{diversityCollisions} collisions</div></div>
              <div className="kpi"><div className="kpi-label">Cost</div><div className="kpi-num">{money(costs.claude + costs.gpt)}</div><div className="kpi-delta">avg {money(messages.length ? (costs.claude + costs.gpt) / messages.length : 0)}</div></div>
            </div>

            <div className="card card-pad" style={{ borderRadius: 8, display: "grid", gap: 12 }}>
              <div className="section-eyebrow">Breakdown</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <strong>By channel</strong>
                  <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
                    {Object.entries(CHANNEL_LABEL).map(([channel, label]) => <span key={channel} className="chip">{label}: {byChannel[channel] || 0}</span>)}
                  </div>
                </div>
                <div>
                  <strong>By tier</strong>
                  <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
                    <span className="chip">Tier 1: {byTier.TIER_1 || 0}</span>
                    <span className="chip">Tier 2: {byTier.TIER_2 || 0}</span>
                    <span className="chip">Tier 3: {byTier.TIER_3 || 0}</span>
                  </div>
                </div>
                <div>
                  <strong>Cost</strong>
                  <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
                    <span className="chip">Claude: {money(costs.claude)}</span>
                    <span className="chip">GPT-4o-mini: {money(costs.gpt)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {Object.entries(CHANNEL_LABEL).map(([channel, label]) => {
                const samples = messages.filter((message) => message.channel === channel).slice(0, 3);
                if (!samples.length) return null;
                return (
                  <section key={channel} style={{ display: "grid", gap: 8 }}>
                    <div className="section-eyebrow">{label} samples</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                      {samples.map((message) => (
                        <div key={message.message_id} className="card card-pad" style={{ borderRadius: 8 }}>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>{message.account_company || message.account_domain}</div>
                          {message.subject && <div style={{ fontWeight: 700, fontSize: 13 }}>{message.subject}</div>}
                          <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>{message.body.slice(0, 220)}...</p>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
