import { useState } from "react";
import Icon from "@/components/ui/Icon";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "connected" | "disconnected" | "coming_soon";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  status: Status;
  logo: string;
  color: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const INTEGRATIONS: Integration[] = [
  // CRM
  { id: "salesforce", name: "Salesforce", description: "Sync accounts, contacts, and opportunities bidirectionally.", category: "CRM", status: "connected", logo: "SF", color: "#00A1E0" },
  { id: "hubspot",    name: "HubSpot",    description: "Push enriched leads and deal stages into your HubSpot CRM.", category: "CRM", status: "disconnected", logo: "HS", color: "#FF7A59" },
  { id: "pipedrive",  name: "Pipedrive",  description: "Auto-create deals from accepted Sales Handoffs.",           category: "CRM", status: "coming_soon",  logo: "PD", color: "#1A1F71" },

  // Data & Enrichment
  { id: "apollo",     name: "Apollo.io",  description: "Source accounts and contacts with 200M+ record coverage.",  category: "Enrichment", status: "connected",    logo: "AP", color: "#6366F1" },
  { id: "harmonic",   name: "Harmonic",   description: "Real-time company signals: funding, headcount, tech stack.", category: "Enrichment", status: "disconnected", logo: "HM", color: "#10B981" },
  { id: "clearbit",   name: "Clearbit",   description: "Enrich company and person records with firmographic data.",  category: "Enrichment", status: "disconnected", logo: "CB", color: "#0EA5E9" },
  { id: "crunchbase", name: "Crunchbase", description: "Pull funding rounds and investor data automatically.",       category: "Enrichment", status: "coming_soon",  logo: "CR", color: "#0288D1" },

  // Outreach
  { id: "outreach",   name: "Outreach",   description: "Push sequences and track email, call, and LinkedIn steps.", category: "Outreach", status: "connected",    logo: "OR", color: "#5A67D8" },
  { id: "salesloft",  name: "Salesloft",  description: "Launch cadences directly from approved Storyteller output.", category: "Outreach", status: "disconnected", logo: "SL", color: "#1A73E8" },
  { id: "gmail",      name: "Gmail",      description: "Send one-off emails from your Google Workspace account.",   category: "Outreach", status: "connected",    logo: "GM", color: "#EA4335" },

  // Communication
  { id: "slack",      name: "Slack",      description: "Get agent alerts and handoff notifications in your channels.", category: "Communication", status: "connected",    logo: "SK", color: "#4A154B" },
  { id: "teams",      name: "MS Teams",   description: "Receive live signal alerts and Copilot summaries in Teams.",   category: "Communication", status: "coming_soon",  logo: "MT", color: "#6264A7" },
];

const CATEGORIES = ["All", "CRM", "Enrichment", "Outreach", "Communication"];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  if (status === "connected") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 99,
        background: "var(--good-50)", border: "1px solid var(--good-200)",
        fontSize: 11, fontWeight: 600, color: "var(--good-700)",
        fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--good-500)", display: "inline-block" }} />
        Connected
      </span>
    );
  }
  if (status === "coming_soon") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 99,
        background: "var(--ink-100)", border: "1px solid var(--border)",
        fontSize: 11, fontWeight: 600, color: "var(--text-3)",
        fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em",
      }}>
        Coming soon
      </span>
    );
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99,
      background: "var(--ink-50)", border: "1px solid var(--border)",
      fontSize: 11, fontWeight: 600, color: "var(--text-3)",
      fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      Not connected
    </span>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ integration, onToggle }: { integration: Integration; onToggle: (id: string) => void }) {
  return (
    <div className="card" style={{
      padding: "20px 22px",
      display: "flex", alignItems: "flex-start", gap: 16,
      transition: "box-shadow 0.15s, border-color 0.15s",
      opacity: integration.status === "coming_soon" ? 0.65 : 1,
    }}>
      {/* Logo */}
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: integration.color, color: "#fff",
        display: "grid", placeItems: "center",
        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
        flexShrink: 0, letterSpacing: "0.02em",
      }}>
        {integration.logo}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{integration.name}</span>
          <StatusBadge status={integration.status} />
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
          {integration.description}
        </p>
      </div>

      {/* Action */}
      <div style={{ flexShrink: 0 }}>
        {integration.status === "coming_soon" ? (
          <button disabled style={{
            padding: "7px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--ink-50)",
            fontSize: 13, fontWeight: 500, color: "var(--text-3)",
            cursor: "not-allowed",
          }}>
            Soon
          </button>
        ) : integration.status === "connected" ? (
          <button
            onClick={() => onToggle(integration.id)}
            style={{
              padding: "7px 14px", borderRadius: 8,
              border: "1px solid var(--bad-200)", background: "var(--bad-50)",
              fontSize: 13, fontWeight: 600, color: "var(--bad-700)",
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bad-100)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bad-50)"; }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={() => onToggle(integration.id)}
            style={{
              padding: "7px 14px", borderRadius: 8,
              border: "1px solid var(--ink-900)", background: "var(--ink-900)",
              fontSize: 13, fontWeight: 600, color: "var(--ink-paper)",
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ink-700)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ink-900)"; }}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [integrations, setIntegrations] = useState(INTEGRATIONS);
  const [search, setSearch] = useState("");

  const connectedCount = integrations.filter(i => i.status === "connected").length;

  function handleToggle(id: string) {
    setIntegrations(prev =>
      prev.map(i => {
        if (i.id !== id) return i;
        return { ...i, status: i.status === "connected" ? "disconnected" : "connected" };
      })
    );
  }

  const filtered = integrations.filter(i => {
    const matchCat = activeCategory === "All" || i.category === activeCategory;
    const matchSearch = !search.trim() || i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Group by category for display
  const grouped = CATEGORIES.slice(1).reduce<Record<string, Integration[]>>((acc, cat) => {
    const items = filtered.filter(i => i.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  return (
    <>
      {/* Page header */}
      <div className="page-head">
        <div>
          <div className="page-head-meta">Settings · Integrations</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Integrations</h1>
        </div>
        <div className="page-head-actions">
          <span style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-3)",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--good-500)", display: "inline-block" }} />
            {connectedCount} of {integrations.length} connected
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Connected", value: connectedCount, color: "var(--good-600)" },
            { label: "Available", value: integrations.filter(i => i.status === "disconnected").length, color: "var(--acc-600)" },
            { label: "Coming soon", value: integrations.filter(i => i.status === "coming_soon").length, color: "var(--text-3)" },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search integrations…"
            style={{
              padding: "8px 14px", borderRadius: 10,
              border: "1px solid var(--border)", background: "var(--surface)",
              fontSize: 13, color: "var(--text)", outline: "none",
              width: 220, fontFamily: "var(--font-sans)",
            }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                  border: `1px solid ${activeCategory === cat ? "var(--ink-900)" : "var(--border)"}`,
                  background: activeCategory === cat ? "var(--ink-900)" : "var(--surface)",
                  color: activeCategory === cat ? "var(--ink-paper)" : "var(--text-2)",
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Integration groups */}
        {Object.entries(grouped).length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-3)", fontSize: 14 }}>
            No integrations match your search.
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} style={{ marginBottom: 28 }}>
              <div className="section-eyebrow" style={{ marginBottom: 10 }}>{category}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map(i => (
                  <IntegrationCard key={i.id} integration={i} onToggle={handleToggle} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
