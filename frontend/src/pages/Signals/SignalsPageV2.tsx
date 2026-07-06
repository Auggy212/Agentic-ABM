import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

// Shape returned by GET /api/signals (backend AccountSignal model_dump).
interface Signal {
  type?: string;          // e.g. FUNDING, RELEVANT_HIRE, EXPANSION, COMPETITOR_REVIEW
  source?: string;        // e.g. GOOGLE_NEWS, LINKEDIN_JOBS, G2, REDDIT, WEB_SCRAPE
  description?: string;
  intent_level?: string;  // HIGH | MEDIUM | LOW
  source_url?: string;
  detected_at?: string;
  evidence_snippet?: string;
}

interface SignalReport {
  signals?: Signal[];
  account_domain?: string;
  buying_stage?: string;
}

// A source_url is usable only if it's a real link (the intel generator emits
// "not_found" when it has no URL).
function validUrl(url: string | undefined): url is string {
  return !!url && url !== "not_found" && /^https?:\/\//i.test(url);
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function signalTypeMeta(type: string | undefined) {
  const t = (type ?? "").toLowerCase();
  if (t.includes("hire") || t.includes("hiring"))
    return { bg: "#eef0fb", color: "#4338ca", label: "Hiring",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg> };
  if (t === "funding" || t.includes("funding"))
    return { bg: "#e6f4ee", color: "#047857", label: "Funding",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> };
  if (t === "news" || t.includes("news") || t.includes("google"))
    return { bg: "#eff6ff", color: "#1d4ed8", label: "News",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6z"/></svg> };
  if (t.includes("g2") || t.includes("review") || t.includes("reddit"))
    return { bg: "#fbf1e3", color: "#b45309", label: t.includes("reddit") ? "Reddit" : "G2 Review",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> };
  if (t.includes("job_change") || t.includes("job change"))
    return { bg: "#f1edfb", color: "#7c3aed", label: "Job Change",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 20a6 6 0 0 1 12 0"/><polyline points="17 11 19 13 23 9"/></svg> };
  return { bg: "#f0f0ec", color: "#6b7180", label: type ?? "Signal",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5a6.4 6.4 0 0 1 0 9M7.5 16.5a6.4 6.4 0 0 1 0-9"/></svg> };
}

function intentMeta(level: string | undefined) {
  const l = (level ?? "").toUpperCase();
  if (l === "HIGH") return { bg: "#e6f4ee", color: "#047857", label: "High intent" };
  if (l === "MEDIUM") return { bg: "#fbf1e3", color: "#b45309", label: "Medium intent" };
  if (l === "LOW") return { bg: "#eef1f5", color: "#64748b", label: "Low intent" };
  return { bg: "#f0f0ec", color: "#6b7180", label: "—" };
}

function Skeleton({ w = "100%", h = 16, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec" }} />;
}

const SIGNAL_FILTERS = ["All", "Hiring", "Funding", "G2 Reviews", "News", "Reddit", "Job Change"];

export default function SignalsPageV2() {
  const clientId = getActiveClientId();
  const [filter, setFilter] = useState("All");

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["signals", clientId],
    queryFn: async () => {
      const { data } = await api.get<Record<string, SignalReport>>("/api/signals", {
        params: { client_id: clientId },
      });
      return data;
    },
  });

  // Flatten signals from all domains
  const allSignals: Array<Signal & { accountName: string }> = [];
  if (rawData) {
    Object.entries(rawData).forEach(([domain, report]) => {
      const name = report.account_domain ?? domain;
      (report.signals ?? []).forEach(s => allSignals.push({ ...s, accountName: name }));
    });
  }

  const filtered = allSignals.filter(s => {
    if (filter === "All") return true;
    const t = (s.type ?? "").toLowerCase();
    const src = (s.source ?? "").toLowerCase();
    if (filter === "Hiring") return t.includes("hire") || t.includes("hiring");
    if (filter === "Funding") return t.includes("funding");
    if (filter === "G2 Reviews") return t.includes("review") || src.includes("g2");
    if (filter === "News") return src.includes("news");
    if (filter === "Reddit") return src.includes("reddit");
    if (filter === "Job Change") return t.includes("job");
    return true;
  });

  // Summary — surfaces coverage so an empty/sparse result explains itself.
  const reports = rawData ? Object.values(rawData) : [];
  const accountsScanned = reports.length;
  const accountsWithSignals = reports.filter(r => (r.signals?.length ?? 0) > 0).length;
  const totalSignals = allSignals.length;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Signals</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>Buying signals detected across tracked accounts</p>
        {!isLoading && (
          <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 12.5, color: "#6b7180" }}>
            <span><strong style={{ color: "#3a3f4c", fontWeight: 700 }}>{accountsScanned}</strong> accounts scanned</span>
            <span><strong style={{ color: "#3a3f4c", fontWeight: 700 }}>{accountsWithSignals}</strong> with signals</span>
            <span><strong style={{ color: "#3a3f4c", fontWeight: 700 }}>{totalSignals}</strong> signals total</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {SIGNAL_FILTERS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{ height: 32, padding: "0 13px", border: `1px solid ${filter === t ? "#4338ca" : "#e3e3df"}`, background: filter === t ? "#eef0fb" : "#fff", color: filter === t ? "#4338ca" : "#6b7180", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 500 }}>
            {t}
          </button>
        ))}
      </div>

      <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, overflow: "hidden" }}>
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "15px 18px", borderBottom: "1px solid #f2f2ee" }}>
            <Skeleton w={34} h={34} r={8} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              <Skeleton w="40%" h={13} />
              <Skeleton w="90%" h={13} />
            </div>
          </div>
        ))}

        {!isLoading && filtered.map((s, i) => {
          const meta = signalTypeMeta(s.type);
          const intent = intentMeta(s.intent_level);
          return (
            <div key={i} style={{ display: "flex", gap: 14, padding: "15px 18px", borderBottom: "1px solid #f2f2ee", alignItems: "flex-start" }}>
              <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, background: meta.bg, color: meta.color, display: "grid", placeItems: "center", marginTop: 1 }}>
                {meta.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.02em", padding: "2px 8px", borderRadius: 5, background: meta.bg, color: meta.color }}>{meta.label}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.accountName}</span>
                  {s.source && (
                    validUrl(s.source_url) ? (
                      <a href={s.source_url} target="_blank" rel="noreferrer" title="Open source" style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 5, background: "#f0f0ec", color: "#4338ca", textDecoration: "none" }}>{s.source} ↗</a>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 5, background: "#f0f0ec", color: "#6b7180" }}>{s.source}</span>
                    )
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#3a3f4c", lineHeight: 1.5 }}>{s.description ?? "—"}</div>
                {validUrl(s.source_url) && (
                  <a href={s.source_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 12, fontWeight: 500, color: "#4338ca", textDecoration: "none" }}>
                    Read full source ↗
                  </a>
                )}
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: intent.bg, color: intent.color }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: intent.color }} />
                  {intent.label}
                </span>
                <span style={{ fontSize: 11.5, color: "#a3a7b3" }}>{relativeTime(s.detected_at)}</span>
              </div>
            </div>
          );
        })}

        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: "46px 18px", textAlign: "center", color: "#a3a7b3", fontSize: 13, lineHeight: 1.6 }}>
            {accountsScanned === 0 ? (
              <>
                No accounts found for the active client.<br />
                <span style={{ fontSize: 12 }}>
                  Signal data is keyed by client — make sure you're signed in as the client that ran discovery.
                  <br />Active client_id: <code style={{ fontSize: 11.5, color: "#8a8f9e" }}>{clientId}</code>
                </span>
              </>
            ) : allSignals.length === 0 ? (
              `${accountsScanned} accounts scanned, but no buying signals detected yet. Re-run Signal Intel to refresh.`
            ) : (
              "No signals match this filter."
            )}
          </div>
        )}
      </section>
    </div>
  );
}
