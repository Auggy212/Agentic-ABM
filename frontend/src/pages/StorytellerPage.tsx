import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type { Message, MessageChannel } from "./Checkpoint3/types";
import { CHANNEL_LABEL } from "./Checkpoint3/types";

interface StorytellerResponse {
  client_id: string;
  messages: Message[];
}

// ── Channel config ────────────────────────────────────────────────────────────

const CHANNEL_META: Record<MessageChannel, { icon: string; color: string; bg: string; border: string; maxChars: number; hint: string }> = {
  LINKEDIN_CONNECTION: { icon: "in",  color: "var(--acc-300)",  bg: "rgba(0,212,255,0.07)",  border: "rgba(0,212,255,0.20)", maxChars: 300,  hint: "Keep it concise — connection notes are limited to 300 chars." },
  LINKEDIN_DM:         { icon: "in",  color: "var(--acc-300)",  bg: "rgba(0,212,255,0.07)",  border: "rgba(0,212,255,0.20)", maxChars: 1900, hint: "Conversational tone. Reference the connection request context." },
  EMAIL:               { icon: "✉",  color: "var(--vio-500)",  bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.20)", maxChars: 2000, hint: "Subject line is critical. Open with the account hook." },
  WHATSAPP:            { icon: "wa", color: "var(--good-500)", bg: "rgba(0,255,150,0.07)",  border: "rgba(0,255,150,0.20)", maxChars: 1000, hint: "Short, human. Avoid markdown — it won't render in WhatsApp." },
  REDDIT_STRATEGY_NOTE:{ icon: "r",  color: "var(--warn-500)", bg: "rgba(255,215,0,0.07)",  border: "rgba(255,215,0,0.20)", maxChars: 5000, hint: "Strategy note for how to engage authentically on relevant subreddits." },
};

const CHANNEL_KEYS = Object.keys(CHANNEL_LABEL) as MessageChannel[];

// ── Role / Tier helpers ───────────────────────────────────────────────────────

const ROLE_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  DECISION_MAKER: { bg: "rgba(0,212,255,0.08)",  fg: "var(--acc-300)",  border: "rgba(0,212,255,0.25)" },
  CHAMPION:       { bg: "rgba(0,255,150,0.08)",  fg: "var(--good-500)", border: "rgba(0,255,150,0.25)" },
  BLOCKER:        { bg: "rgba(255,70,70,0.08)",  fg: "var(--bad-500)",  border: "rgba(255,70,70,0.25)" },
  INFLUENCER:     { bg: "rgba(255,215,0,0.08)",  fg: "var(--warn-500)", border: "rgba(255,215,0,0.25)" },
};

const TIER_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  TIER_1: { label: "T1", bg: "rgba(255,215,0,0.15)", fg: "var(--warn-500)" },
  TIER_2: { label: "T2", bg: "var(--surface-3)", fg: "var(--text-3)" },
  TIER_3: { label: "T3", bg: "var(--surface-3)", fg: "var(--text-mute)" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_STYLE[role] ?? { bg: "var(--surface-3)", fg: "var(--text-3)", border: "var(--border)" };
  return (
    <span style={{
      padding: "2px 9px", borderRadius: 999,
      border: `1px solid ${c.border}`, background: c.bg, color: c.fg,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
    }}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const t = TIER_STYLE[tier] ?? TIER_STYLE.TIER_3;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 6,
      background: t.bg, color: t.fg,
      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
    }}>
      {t.label}
    </span>
  );
}

// ── Personalization layer inspector ──────────────────────────────────────────

function LayerTag({ label, text, untraced }: { label: string; text: string; untraced?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      onClick={() => setOpen((v) => !v)}
      title={open ? "" : text}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 8px", borderRadius: 6, cursor: "pointer",
        background: untraced ? "rgba(255,215,0,0.10)" : "var(--acc-950,#0f1629)",
        border: `1px solid ${untraced ? "rgba(255,215,0,0.30)" : "var(--acc-800,#1e2a55)"}`,
        color: untraced ? "var(--warn-500)" : "var(--acc-300,#a5b4fc)",
        fontSize: 11, fontWeight: 600,
        userSelect: "none",
        maxWidth: open ? "none" : 140,
        whiteSpace: open ? "normal" : "nowrap",
        overflow: open ? "visible" : "hidden",
        textOverflow: open ? "clip" : "ellipsis",
        transition: "all 0.15s",
      }}
    >
      <span style={{ opacity: 0.7, fontSize: 9 }}>{label}</span>
      {open ? text : text.slice(0, 40) + (text.length > 40 ? "…" : "")}
    </span>
  );
}

// ── Message card ─────────────────────────────────────────────────────────────

function MessageCard({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const meta = CHANNEL_META[msg.channel];
  const charCount = msg.body.length;
  const overLimit = charCount > meta.maxChars;
  const layers = msg.personalization_layers;
  const hasHardFail = msg.validation_state?.traceability === "HARD_FAIL";

  function copy() {
    const text = msg.subject ? `Subject: ${msg.subject}\n\n${msg.body}` : msg.body;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${hasHardFail ? "var(--bad-100)" : "var(--border)"}`,
      borderLeft: `3px solid ${hasHardFail ? "var(--bad-500,#e0493c)" : meta.color}`,
      borderRadius: 14,
      overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "10px 16px",
        background: "var(--surface-2)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            padding: "2px 9px", borderRadius: 6,
            background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
            fontSize: 11, fontWeight: 700,
          }}>
            {CHANNEL_LABEL[msg.channel]}
          </span>
          {msg.tier && <TierBadge tier={msg.tier} />}
          <span style={{ fontSize: 11, color: "var(--text-mute)" }}>#{msg.sequence_position}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {hasHardFail && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
              background: "var(--bad-50)", color: "var(--bad-700)", border: "1px solid var(--bad-100)",
            }}>
              ⚠ Trace fail
            </span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: overLimit ? "var(--bad-700)" : "var(--text-mute)",
          }}>
            {charCount}/{meta.maxChars}
          </span>
          <button
            onClick={() => setShowLayers((v) => !v)}
            title="Toggle personalization layers"
            style={{
              padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)",
              background: showLayers ? "var(--acc-950)" : "var(--surface-3)",
              color: showLayers ? "var(--acc-300)" : "var(--text-3)",
              fontSize: 10, fontWeight: 700, cursor: "pointer",
            }}
          >
            ✦ Layers
          </button>
          <button
            onClick={copy}
            style={{
              padding: "3px 10px", borderRadius: 6, border: "none",
              background: copied ? "var(--good-50)" : "var(--acc-600,#4f46e5)",
              color: copied ? "var(--good-700)" : "#fff",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>

      {/* Personalization layers */}
      {showLayers && layers && (
        <div style={{
          padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 6,
          background: "var(--acc-950,#0a0f24)",
          borderBottom: "1px solid var(--acc-800,#1e2a55)",
        }}>
          <LayerTag label="account" text={layers.account_hook?.text ?? "—"} untraced={layers.account_hook?.untraced} />
          <LayerTag label="buyer"   text={layers.buyer_hook?.text   ?? "—"} untraced={layers.buyer_hook?.untraced} />
          <LayerTag label="pain"    text={layers.pain?.text         ?? "—"} untraced={layers.pain?.untraced} />
          <LayerTag label="value"   text={layers.value?.text        ?? "—"} untraced={layers.value?.untraced} />
        </div>
      )}

      {/* Message body */}
      <div style={{ padding: "16px 18px" }}>
        {msg.subject && (
          <div style={{
            fontWeight: 800, fontSize: 13, color: "var(--text)",
            marginBottom: 10, paddingBottom: 10,
            borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)", marginRight: 6 }}>Subject</span>
            {msg.subject}
          </div>
        )}
        <div style={{
          fontSize: 13, color: "var(--text-2)", lineHeight: 1.75,
          whiteSpace: "pre-wrap", fontFamily: "var(--font-sans)",
        }}>
          {msg.body}
        </div>
      </div>

      {/* Channel hint */}
      <div style={{
        padding: "8px 18px",
        background: "var(--surface-2)",
        borderTop: "1px solid var(--border)",
        fontSize: 11, color: "var(--text-mute)",
      }}>
        💡 {meta.hint}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ isError }: { isError?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Activation · Storyteller</div>
          <h1 className="ph-title">Storyteller</h1>
          <p className="ph-subtitle">AI-crafted, persona-aware outreach across every channel.</p>
        </div>
      </div>
      <div className="page-body">
        <div style={{
          background: "var(--surface)", border: "1.5px dashed var(--border-strong)",
          borderRadius: 14, padding: "64px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text)", marginBottom: 8 }}>
            {isError ? "Unable to load messages" : "No messages generated yet"}
          </div>
          <div style={{ fontSize: 14, color: "var(--text-3)", maxWidth: 380, margin: "0 auto 20px" }}>
            {isError
              ? "The storyteller feed did not load. Check that the Storyteller agent has run."
              : "Run the Storyteller agent from the Agents page to generate personalised outreach for your Tier 1 accounts."}
          </div>
          <Link to="/agents" style={{
            display: "inline-block", padding: "9px 22px", borderRadius: 10,
            background: "linear-gradient(135deg, var(--acc-500), var(--acc-700))",
            color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none",
          }}>
            Go to Agents →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function StorytellerPage() {
  const [params] = useSearchParams();
  const clientId = params.get("client_id") || getActiveClientId();

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<MessageChannel>("EMAIL");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["storyteller-output", clientId],
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<StorytellerResponse>("/api/storyteller/messages", {
        params: { client_id: clientId },
      });
      return data;
    },
  });

  const messages = query.data?.messages ?? [];

  const contacts = useMemo(() => {
    const seen = new Map<string, {
      id: string; name: string; title: string; company: string;
      role: string; domain: string; tier: string;
      channelCounts: Record<string, number>;
    }>();
    for (const m of messages) {
      if (!m.contact_id) continue;
      if (!seen.has(m.contact_id)) {
        seen.set(m.contact_id, {
          id: m.contact_id,
          name: m.contact_name ?? m.contact_id.slice(0, 8),
          title: m.contact_title ?? "",
          company: m.account_company ?? m.account_domain,
          domain: m.account_domain,
          role: m.contact_committee_role ?? "INFLUENCER",
          tier: m.tier ?? "TIER_2",
          channelCounts: {},
        });
      }
      const c = seen.get(m.contact_id)!;
      c.channelCounts[m.channel] = (c.channelCounts[m.channel] ?? 0) + 1;
    }
    return Array.from(seen.values()).filter((c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase())
    );
  }, [messages, search]);

  const selectedContact = contacts.find((c) => c.id === selectedContactId) ?? contacts[0] ?? null;

  const contactMessages = messages.filter(
    (m) => m.contact_id === selectedContact?.id && m.channel === activeChannel
  );

  const channelsWithMessages = useMemo(() =>
    CHANNEL_KEYS.filter((ch) =>
      messages.some((m) => m.contact_id === selectedContact?.id && m.channel === ch)
    ),
    [messages, selectedContact]
  );

  const totalMessages = messages.length;
  const totalContacts = contacts.length;
  const channelCoverage = CHANNEL_KEYS.filter((ch) => messages.some((m) => m.channel === ch)).length;
  const hardFails = messages.filter((m) => m.validation_state?.traceability === "HARD_FAIL").length;

  // Avatar color from domain string
  function avatarColor(s: string) {
    const palette = ["#8b5cf6","#00d4ff","#00ff96","#ffd700","#ff4646","#a78bfa","#f472b6","#2dd4bf","#fb923c","#60a5fa"];
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    return palette[h % palette.length];
  }

  if (query.isLoading) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="lg" label="Loading Storyteller output" />
      </div>
    );
  }

  if (query.isError || messages.length === 0) {
    return <EmptyState isError={query.isError} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Activation · Storyteller</div>
          <h1 className="ph-title">Storyteller</h1>
          <p className="ph-subtitle">
            AI-crafted, persona-aware outreach — every message traced to verified intelligence.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi" data-tone="green">
            <div className="ph-kpi-label">Messages</div>
            <div className="ph-kpi-num">{totalMessages}</div>
          </div>
          <div className="ph-kpi">
            <div className="ph-kpi-label">Contacts</div>
            <div className="ph-kpi-num">{totalContacts}</div>
          </div>
          <div className="ph-kpi">
            <div className="ph-kpi-label">Channels</div>
            <div className="ph-kpi-num">{channelCoverage}</div>
          </div>
          {hardFails > 0 && (
            <div className="ph-kpi" data-tone="red">
              <div className="ph-kpi-label">Trace fails</div>
              <div className="ph-kpi-num">{hardFails}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Two-panel layout ── */}
      <div className="page-body" style={{ padding: 0 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          minHeight: "calc(100vh - 220px)",
          borderTop: "1px solid var(--border)",
        }}>

          {/* ── Left: contact list ── */}
          <div style={{
            borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
            background: "var(--surface)",
          }}>
            {/* Search */}
            <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-mute)", textTransform: "uppercase", marginBottom: 8 }}>
                {contacts.length} Contact{contacts.length !== 1 ? "s" : ""}
              </div>
              <input
                type="text"
                placeholder="Search contacts or companies…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px",
                  border: "1.5px solid var(--border)", borderRadius: 9,
                  fontSize: 12, outline: "none",
                  background: "var(--surface-2)", color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Contact list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {contacts.map((c) => {
                const isActive = c.id === selectedContact?.id;
                const color = avatarColor(c.domain);
                const msgCount = Object.values(c.channelCounts).reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedContactId(c.id); setActiveChannel("EMAIL"); }}
                    style={{
                      padding: "11px 14px",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background: isActive ? "var(--acc-950,#0a0f24)" : "transparent",
                      borderLeft: `3px solid ${isActive ? "var(--acc-500)" : "transparent"}`,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {/* Avatar */}
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        background: color, color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 13,
                        boxShadow: isActive ? `0 2px 8px ${color}55` : "none",
                      }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: isActive ? "var(--acc-200)" : "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.name}
                          </span>
                          <TierBadge tier={c.tier} />
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.title ? `${c.title} · ` : ""}{c.company}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
                          <RoleBadge role={c.role} />
                          <span style={{ fontSize: 10, color: "var(--text-mute)", marginLeft: "auto" }}>{msgCount} msg{msgCount !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: message viewer ── */}
          {selectedContact ? (
            <div style={{ display: "flex", flexDirection: "column", background: "var(--surface-2)", minWidth: 0 }}>

              {/* Contact header */}
              <div style={{
                padding: "16px 22px",
                background: "var(--surface)",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                        {selectedContact.name}
                      </h2>
                      <RoleBadge role={selectedContact.role} />
                      <TierBadge tier={selectedContact.tier} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                      {selectedContact.title && `${selectedContact.title} · `}
                      <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{selectedContact.company}</span>
                      <span style={{ color: "var(--text-mute)", marginLeft: 6 }}>{selectedContact.domain}</span>
                    </div>
                  </div>
                  <Link
                    to={`/checkpoint-3?client_id=${clientId}`}
                    style={{
                      padding: "7px 16px", borderRadius: 9,
                      background: "linear-gradient(135deg, var(--acc-500), var(--acc-700))",
                      color: "#fff", fontWeight: 700, fontSize: 12, textDecoration: "none",
                      boxShadow: "0 0 14px rgba(0,212,255,0.30), 0 2px 8px rgba(0,0,0,0.4)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open CP3 Review →
                  </Link>
                </div>

                {/* Channel switcher */}
                <div style={{ display: "flex", gap: 6, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-mute)", textTransform: "uppercase", marginRight: 4 }}>
                    Channel
                  </span>
                  {CHANNEL_KEYS.map((ch) => {
                    const hasMsgs = channelsWithMessages.includes(ch);
                    const isActive = activeChannel === ch;
                    const m = CHANNEL_META[ch];
                    return (
                      <button
                        key={ch}
                        onClick={() => setActiveChannel(ch)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 12px", borderRadius: 9, cursor: "pointer",
                          border: `1.5px solid ${isActive ? m.color : "var(--border)"}`,
                          background: isActive ? m.bg : "var(--surface-3)",
                          color: isActive ? m.color : hasMsgs ? "var(--text-2)" : "var(--text-mute)",
                          fontSize: 12, fontWeight: isActive ? 700 : 500,
                          opacity: hasMsgs ? 1 : 0.45,
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          background: isActive ? m.color : "var(--surface-2)",
                          color: isActive ? "#fff" : "var(--text-3)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 900,
                        }}>
                          {m.icon.toUpperCase().slice(0, 2)}
                        </span>
                        {CHANNEL_LABEL[ch]}
                        {hasMsgs && (
                          <span style={{
                            padding: "1px 6px", borderRadius: 5,
                            background: isActive ? `${m.color}22` : "var(--surface)",
                            color: isActive ? m.color : "var(--text-mute)",
                            fontSize: 10, fontWeight: 700,
                          }}>
                            {selectedContact.channelCounts[ch] ?? 0}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                {contactMessages.length === 0 ? (
                  <div style={{
                    background: "var(--surface)", border: "1.5px dashed var(--border-strong)",
                    borderRadius: 14, padding: "48px 24px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 12, color: "var(--text-mute)" }}>
                      {CHANNEL_META[activeChannel].icon.toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 6 }}>
                      No {CHANNEL_LABEL[activeChannel]} messages for this contact
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                      The Storyteller did not generate {CHANNEL_LABEL[activeChannel]} outreach for {selectedContact.name}.
                      Try another channel or re-run the agent.
                    </div>
                  </div>
                ) : (
                  contactMessages.map((msg) => (
                    <MessageCard key={msg.message_id} msg={msg} />
                  ))
                )}
              </div>

            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
              <div style={{ textAlign: "center", color: "var(--text-mute)", fontSize: 14 }}>
                Select a contact to view their messages
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
