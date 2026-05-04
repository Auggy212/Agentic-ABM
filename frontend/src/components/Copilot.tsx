import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/lib/api";
import Btn from "@/components/ui/Btn";
import Icon from "@/components/ui/Icon";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useCopilotContext } from "@/hooks/useCopilotContext";
import type { CopilotMessage } from "@/types/copilot";

interface CopilotAPIResponse {
  text: string;
  trace?: Array<{ text: string; done: boolean }>;
  cards?: Array<{ title: string; body: string; actions: string[] }>;
}

export default function Copilot() {
  const { data: ctx, isLoading } = useCopilotContext();

  const [thread, setThread] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Seed initial message once context loads
  useEffect(() => {
    if (!ctx || thread.length > 0) return;
    const initial: CopilotMessage = {
      id: uuidv4(),
      from: "agent",
      name: "ABM Copilot",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: ctx.greeting,
      cards: ctx.initial_cards,
    };
    setThread([initial]);
  }, [ctx]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    const userMsg: CopilotMessage = {
      id: uuidv4(),
      from: "user",
      name: "You",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text,
    };
    setThread((t) => [...t, userMsg]);
    setDraft("");
    setSending(true);

    try {
      const { data } = await api.post<CopilotAPIResponse>("/api/copilot/message", {
        message: text,
      });

      const agentMsg: CopilotMessage = {
        id: uuidv4(),
        from: "agent",
        name: "ABM Copilot",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: data.text,
        trace: data.trace,
        cards: data.cards,
      };
      setThread((t) => [...t, agentMsg]);
    } catch (error) {
      const errorMsg: CopilotMessage = {
        id: uuidv4(),
        from: "agent",
        name: "ABM Copilot",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: "Sorry, I encountered an error processing your request. Please try again.",
      };
      setThread((t) => [...t, errorMsg]);
    } finally {
      setSending(false);
    }
  }

  const chips = ctx?.chips ?? [];
  const agentLabel = ctx?.agent_run_label ?? "—";

  return (
    <aside className="copilot">
      <div className="copilot-head">
        <div className="copilot-head-title">Copilot</div>
        <div className="copilot-head-meta">groq · {agentLabel}</div>
      </div>

      <div className="copilot-body" ref={bodyRef}>
        {isLoading && thread.length === 0 && (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
            <LoadingSpinner size="sm" label="Loading context" />
          </div>
        )}
        {thread.map((m) => (
          <div key={m.id} className="copilot-msg" data-from={m.from}>
            <div className="copilot-msg-avatar">
              {m.from === "user" ? "Y" : <Icon name="sparkle" size={11} />}
            </div>
            <div className="copilot-msg-bubble">
              <div className="copilot-msg-name">
                {m.name}
                <span className="copilot-msg-time">{m.time}</span>
              </div>
              {m.trace && (
                <div className="copilot-trace">
                  {m.trace.map((s, j) => (
                    <div key={j} className="copilot-trace-step" data-done={String(s.done)}>
                      {s.text}
                    </div>
                  ))}
                </div>
              )}
              <div>{m.text}</div>
              {m.cards?.map((c, j) => (
                <div key={j} className="copilot-card">
                  <div className="copilot-card-head">
                    <Icon name="zap" size={13} />
                    {c.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>{c.body}</div>
                  <div className="copilot-card-actions">
                    {c.actions.map((a, k) => (
                      <button key={k} className="btn btn-sm" data-variant={k === 0 ? "accent" : ""}>{a}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="copilot-suggestion-chips">
          {chips.map((s) => (
            <button key={s} className="copilot-chip" onClick={() => setDraft(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="copilot-composer">
        <textarea
          className="copilot-composer-input"
          placeholder="Ask the copilot or describe a workflow…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
          disabled={sending}
        />
        <div className="copilot-composer-foot">
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            ⌘↵ to send · {ctx ? `${ctx.account_count} accounts · ${ctx.sequence_count} sequences` : "loading…"}
          </span>
          <Btn variant="accent" size="sm" icon="send" onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Btn>
        </div>
      </div>
    </aside>
  );
}
