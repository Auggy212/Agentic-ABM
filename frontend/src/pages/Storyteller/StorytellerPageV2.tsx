import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

interface Account { id?: string; name?: string; company_name?: string; domain?: string; }
interface AccountListResponse { accounts: Account[]; total: number; }

interface MessageRecord {
  id?: string;
  client_id?: string;
  account_domain?: string;
  contact_id?: string;
  subject?: string;
  body?: string;
  status?: string;
  template_id?: string;
  persona?: string;
}

function Skeleton({ w = "100%", h = 16, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec" }} />;
}

const PERSONAS = ["Economic Buyer", "Champion", "Technical Buyer", "Influencer"];
const TONES = ["Consultative", "Direct", "Warm", "Executive"];
const TEMPLATES = ["3-touch sequence", "Single cold email", "Re-engagement", "Event follow-up"];

// Stable signature of the current message set, used to detect when a background
// generation run has produced new/updated content so we can stop polling.
function messagesSig(msgs?: MessageRecord[]): string {
  return (msgs ?? [])
    .map((m: any) => `${m.contact_id}:${m.sequence_position}:${m.last_updated_at}`)
    .sort()
    .join("|");
}

const MAX_POLL_MS = 120_000;

export default function StorytellerPageV2() {
  const clientId = getActiveClientId();
  const [selectedAccount, setSelectedAccount] = useState("");
  const [persona, setPersona] = useState(PERSONAS[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [copied, setCopied] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const baselineSigRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: accountsResp, isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts-storyteller", clientId],
    queryFn: async () => {
      const { data } = await api.get<AccountListResponse>("/api/accounts", {
        params: { client_id: clientId, page_size: 100 },
      });
      return data;
    },
  });

  // Fetch existing messages. While a background generation run is in flight we
  // poll this endpoint so the real draft replaces the previous content as soon
  // as the StorytellerAgent finishes writing it.
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", clientId],
    queryFn: async () => {
      const { data } = await api.get<{ messages: MessageRecord[] }>("/api/storyteller/messages", {
        params: { client_id: clientId },
      });
      return data;
    },
    refetchInterval: isPolling ? 2500 : false,
  });

  // Keep the latest messages reachable synchronously inside the mutation callback.
  const messagesRef = useRef<{ messages: MessageRecord[] } | undefined>(undefined);
  messagesRef.current = messagesData;

  const accounts = accountsResp?.accounts ?? [];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/api/storyteller/generate", {
        client_id: clientId,
        scope: "all",
      });
      return data;
    },
    onSuccess: () => {
      // Generation runs asynchronously on the backend; snapshot the current
      // message set and start polling until new/updated content shows up.
      baselineSigRef.current = messagesSig(messagesRef.current?.messages);
      setPollError(null);
      setIsPolling(true);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(() => setIsPolling(false), MAX_POLL_MS);
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? "Generation failed";
      setPollError(detail);
      setIsPolling(false);
    },
  });

  // Stop polling once the message set changes from the pre-generation baseline.
  useEffect(() => {
    if (!isPolling) return;
    if (baselineSigRef.current === null) return;
    if (messagesSig(messagesData?.messages) !== baselineSigRef.current) {
      setIsPolling(false);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    }
  }, [messagesData, isPolling]);

  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  // Show first message if available
  const firstMsg = messagesData?.messages?.[0];
  const displayMsg = firstMsg
    ? { subject: firstMsg.subject ?? "", body: firstMsg.body ?? "", account_name: firstMsg.account_domain ?? "", persona: firstMsg.persona ?? "" }
    : null;

  const handleCopy = () => {
    if (displayMsg) {
      navigator.clipboard.writeText(`Subject: ${displayMsg.subject}\n\n${displayMsg.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Storyteller</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>Generate signal-led outreach tailored to each buyer</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, alignItems: "start" }}>
        {/* Config panel */}
        <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "18px 19px" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Configuration</h2>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3a3f4c", marginBottom: 6 }}>Account</label>
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid #e3e3df", borderRadius: 7, background: "#f7f7f5", font: "inherit", fontSize: 13, outline: "none", color: "#1a1d29", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238a8f9e' stroke-width='2.2'><polyline points='6 9 12 15 18 9'/></svg>\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", appearance: "none" }}
            >
              <option value="">Select an account…</option>
              {accountsLoading && <option disabled>Loading…</option>}
              {accounts.map((a, i) => {
                const name = a.name ?? a.company_name ?? a.domain ?? "Unknown";
                return <option key={i} value={a.id ?? a.domain ?? String(i)}>{name}</option>;
              })}
            </select>
          </div>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3a3f4c", marginBottom: 6 }}>Persona</label>
            <select value={persona} onChange={e => setPersona(e.target.value)} style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid #e3e3df", borderRadius: 7, background: "#f7f7f5", font: "inherit", fontSize: 13, outline: "none", color: "#1a1d29", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238a8f9e' stroke-width='2.2'><polyline points='6 9 12 15 18 9'/></svg>\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", appearance: "none" }}>
              {PERSONAS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3a3f4c", marginBottom: 6 }}>Tone</label>
            <select value={tone} onChange={e => setTone(e.target.value)} style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid #e3e3df", borderRadius: 7, background: "#f7f7f5", font: "inherit", fontSize: 13, outline: "none", color: "#1a1d29", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238a8f9e' stroke-width='2.2'><polyline points='6 9 12 15 18 9'/></svg>\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", appearance: "none" }}>
              {TONES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3a3f4c", marginBottom: 6 }}>Template</label>
            <select value={template} onChange={e => setTemplate(e.target.value)} style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid #e3e3df", borderRadius: 7, background: "#f7f7f5", font: "inherit", fontSize: 13, outline: "none", color: "#1a1d29", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238a8f9e' stroke-width='2.2'><polyline points='6 9 12 15 18 9'/></svg>\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", appearance: "none" }}>
              {TEMPLATES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            style={{ width: "100%", height: 38, border: "1px solid #4338ca", background: generateMutation.isPending ? "#6b7fcb" : "#4338ca", borderRadius: 7, cursor: generateMutation.isPending ? "not-allowed" : "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>
            {generateMutation.isPending ? "Generating…" : "Generate draft"}
          </button>
        </section>

        {/* Preview panel */}
        <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #eeeeea" }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Generated Draft</h2>
            {isPolling ? (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: "#fef3e2", color: "#b45309" }}>Generating…</span>
            ) : displayMsg ? (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: "#e6f4ee", color: "#047857" }}>Ready</span>
            ) : null}
            <div style={{ flex: 1 }} />
            <button onClick={handleCopy} disabled={!displayMsg} style={{ height: 32, padding: "0 12px", border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: displayMsg ? "pointer" : "not-allowed", font: "inherit", fontSize: 12.5, fontWeight: 500, color: "#3a3f4c", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} style={{ height: 32, padding: "0 12px", border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 500, color: "#3a3f4c", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
              Regenerate
            </button>
          </div>

          {pollError ? (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "#b91c1c", fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Generation failed</div>
              <div style={{ color: "#9ca0ac" }}>{pollError}</div>
            </div>
          ) : (messagesLoading || generateMutation.isPending || isPolling) ? (
            <div style={{ padding: "16px 18px 24px" }}>
              {isPolling && <div style={{ fontSize: 12.5, color: "#b45309", marginBottom: 14 }}>Generating your sequence… this updates automatically when ready.</div>}
              <Skeleton w="40%" h={12} /><div style={{ marginTop: 8 }}><Skeleton w="70%" h={18} /></div>
              <div style={{ marginTop: 16 }}><Skeleton h={14} /><div style={{ marginTop: 6 }}><Skeleton h={14} /></div><div style={{ marginTop: 6 }}><Skeleton w="80%" h={14} /></div></div>
            </div>
          ) : displayMsg ? (
            <>
              <div style={{ padding: "16px 18px 0" }}>
                <div style={{ fontSize: 12, color: "#a3a7b3", marginBottom: 3 }}>Subject</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{displayMsg.subject}</div>
              </div>
              <div style={{ padding: "0 18px" }}>
                <textarea
                  readOnly
                  value={displayMsg.body ?? ""}
                  style={{ width: "100%", minHeight: 300, padding: "14px 15px", border: "1px solid #e7e7e3", borderRadius: 7, background: "#fafaf8", font: "inherit", fontSize: 13, lineHeight: 1.65, color: "#3a3f4c", resize: "vertical", outline: "none" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px" }}>
                <div style={{ flex: 1 }} />
                <button style={{ height: 36, padding: "0 14px", border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 500, color: "#3a3f4c" }}>Save to library</button>
                <button style={{ height: 36, padding: "0 16px", border: "1px solid #4338ca", background: "#4338ca", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#fff", display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
                  Approve
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: "60px 18px", textAlign: "center", color: "#a3a7b3", fontSize: 13 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#f0f0ec", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "#c4c4be" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
              </div>
              Configure and click "Generate draft" to create personalized outreach.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
