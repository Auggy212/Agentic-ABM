import { useState } from "react";

type Category = "All" | "CRM" | "Enrichment" | "Outreach" | "Communication";
type Status = "CONNECTED" | "NOT_CONNECTED" | "COMING_SOON";

interface Integration {
  id: string;
  name: string;
  abbr: string;
  color: string;
  description: string;
  status: Status;
  category: Exclude<Category, "All">;
}

const INTEGRATIONS: Integration[] = [
  { id: "salesforce",    name: "Salesforce",    abbr: "SF", color: "#0ea5e9", description: "Sync accounts, contacts, and opportunities bidirectionally.",          status: "CONNECTED",     category: "CRM" },
  { id: "hubspot",       name: "HubSpot",       abbr: "HS", color: "#f97316", description: "Push enriched leads and deal stages into your HubSpot CRM.",           status: "NOT_CONNECTED", category: "CRM" },
  { id: "pipedrive",     name: "Pipedrive",     abbr: "PD", color: "#6d28d9", description: "Auto-create deals from accepted Sales Handoffs.",                       status: "COMING_SOON",   category: "CRM" },
  { id: "apollo",        name: "Apollo.io",     abbr: "AP", color: "#7c3aed", description: "Source accounts and contacts with 200M+ record coverage.",              status: "CONNECTED",     category: "Enrichment" },
  { id: "harmonic",      name: "Harmonic",      abbr: "HA", color: "#0891b2", description: "Company growth signals, funding events, and headcount data.",           status: "CONNECTED",     category: "Enrichment" },
  { id: "clay",          name: "Clay",          abbr: "CL", color: "#059669", description: "Waterfall enrichment across 75+ data providers.",                       status: "NOT_CONNECTED", category: "Enrichment" },
  { id: "crunchbase",    name: "Crunchbase",    abbr: "CB", color: "#2563eb", description: "Funding, investor, and executive-level company data.",                  status: "COMING_SOON",   category: "Enrichment" },
  { id: "instantly",     name: "Instantly",     abbr: "IN", color: "#d97706", description: "Scale cold email sequences with warm-up and deliverability.",           status: "CONNECTED",     category: "Outreach" },
  { id: "phantombuster", name: "PhantomBuster", abbr: "PB", color: "#7c3aed", description: "LinkedIn automation for connection requests and DMs.",                  status: "CONNECTED",     category: "Outreach" },
  { id: "twilio",        name: "Twilio",        abbr: "TW", color: "#dc2626", description: "Send WhatsApp and SMS messages at scale.",                              status: "NOT_CONNECTED", category: "Communication" },
  { id: "slack",         name: "Slack",         abbr: "SL", color: "#4a154b", description: "Get real-time alerts when leads engage or handoffs are created.",       status: "COMING_SOON",   category: "Communication" },
  { id: "gmail",         name: "Gmail",         abbr: "GM", color: "#ea4335", description: "Track email opens and replies natively from Gmail.",                    status: "NOT_CONNECTED", category: "Communication" },
];

const CATEGORIES: Category[] = ["All", "CRM", "Enrichment", "Outreach", "Communication"];

const STATUS_STYLE: Record<Status, { bg: string; fg: string; border: string; dot?: string; label: string }> = {
  CONNECTED:     { bg: "var(--good-50)",    fg: "var(--good-700)",   border: "var(--good-100)",   dot: "var(--good-500)", label: "Connected" },
  NOT_CONNECTED: { bg: "var(--surface-3)",  fg: "var(--text-3)",     border: "var(--border)",                            label: "Not connected" },
  COMING_SOON:   { bg: "var(--acc-50)",     fg: "var(--acc-600)",    border: "var(--acc-100)",                           label: "Coming soon" },
};

function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 999,
      background: s.bg, border: `1px solid ${s.border}`,
      color: s.fg, fontSize: 11, fontWeight: 700,
    }}>
      {s.dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block" }} />}
      {s.label.toUpperCase()}
    </span>
  );
}

function IntegrationCard({ item }: { item: Integration }) {
  const isConnected  = item.status === "CONNECTED";
  const isComingSoon = item.status === "COMING_SOON";

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${isConnected ? "var(--good-100)" : "var(--border)"}`,
      borderLeft: `3px solid ${isConnected ? "var(--good-500)" : isComingSoon ? "var(--acc-300)" : "var(--border-strong)"}`,
      borderRadius: 12,
      padding: "14px 18px",
      display: "flex", alignItems: "center", gap: 16,
      transition: "box-shadow 0.15s, transform 0.15s",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 12px rgba(0,0,0,0.06)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      {/* Logo */}
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        background: item.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 2px 8px ${item.color}44`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{item.abbr}</span>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{item.name}</span>
          <StatusBadge status={item.status} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>{item.description}</div>
      </div>

      {/* Action */}
      {isConnected && (
        <button style={{
          padding: "6px 16px", borderRadius: 8, border: "1px solid var(--bad-100)",
          background: "var(--bad-50)", color: "var(--bad-700)",
          fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0,
        }}>
          Disconnect
        </button>
      )}
      {!isConnected && !isComingSoon && (
        <button style={{
          padding: "6px 16px", borderRadius: 8, border: "none",
          background: "linear-gradient(135deg, var(--acc-500), var(--acc-700))",
          color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0,
          boxShadow: "0 0 12px rgba(0,212,255,0.30), 0 2px 8px rgba(0,0,0,0.4)",
        }}>
          Connect
        </button>
      )}
      {isComingSoon && (
        <button disabled style={{
          padding: "6px 16px", borderRadius: 8,
          border: "1px solid var(--border)", background: "var(--surface-3)",
          color: "var(--text-mute)", fontWeight: 600, fontSize: 12, cursor: "not-allowed", flexShrink: 0,
        }}>
          Soon
        </button>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const [category, setCategory] = useState<Category>("All");
  const [search, setSearch] = useState("");

  const connected  = INTEGRATIONS.filter((i) => i.status === "CONNECTED").length;
  const available  = INTEGRATIONS.filter((i) => i.status === "NOT_CONNECTED").length;
  const comingSoon = INTEGRATIONS.filter((i) => i.status === "COMING_SOON").length;

  const filtered = INTEGRATIONS.filter((i) => {
    const matchCat    = category === "All" || i.category === category;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const groups = CATEGORIES.filter((c) => c !== "All").reduce<Record<string, Integration[]>>((acc, cat) => {
    const items = filtered.filter((i) => i.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Settings · Integrations</div>
          <h1 className="ph-title">Integrations</h1>
          <p className="ph-subtitle">
            Connect your CRM, enrichment sources, and outreach tools to the ABM pipeline.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi" data-tone="green">
            <div className="ph-kpi-label">Connected</div>
            <div className="ph-kpi-num">{connected}</div>
          </div>
          <div className="ph-kpi">
            <div className="ph-kpi-label">Available</div>
            <div className="ph-kpi-num">{available}</div>
          </div>
          <div className="ph-kpi">
            <div className="ph-kpi-label">Coming soon</div>
            <div className="ph-kpi-num">{comingSoon}</div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Search + category filters ── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search integrations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: "1 1 200px", padding: "8px 14px",
              border: "1.5px solid var(--border)", borderRadius: 10,
              fontSize: 13, outline: "none",
              background: "var(--surface)", color: "var(--text)",
            }}
          />
          <div style={{ display: "flex", gap: 4, padding: "3px", background: "var(--surface-3)", borderRadius: 10 }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontWeight: 600, fontSize: 12,
                  background: category === cat ? "var(--surface)" : "transparent",
                  color: category === cat ? "var(--text)" : "var(--text-3)",
                  boxShadow: category === cat ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── Integration groups ── */}
        {Object.keys(groups).length === 0 ? (
          <div style={{
            background: "var(--surface)", border: "1.5px dashed var(--border-strong)",
            borderRadius: 12, padding: "48px 24px", textAlign: "center",
            color: "var(--text-3)", fontSize: 14,
          }}>
            No integrations match your search.
          </div>
        ) : (
          Object.entries(groups).map(([cat, items]) => (
            <div key={cat} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.12em", color: "var(--text-mute)",
                padding: "0 2px",
              }}>
                {cat}
              </div>
              {items.map((item) => (
                <IntegrationCard key={item.id} item={item} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
