// React import needed for JSX
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

interface BuyerProfile {
  contact_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  current_title?: string;
  title?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  committee_role?: string;
  pain_points?: string[];
}

interface BuyerIntelPackage {
  accounts?: Record<string, BuyerProfile[]>;
}

function roleMeta(role: string | undefined) {
  const r = (role ?? "").toLowerCase();
  if (r.includes("economic")) return { bg: "#eef0fb", color: "#4338ca", label: "Economic Buyer" };
  if (r.includes("champion")) return { bg: "#e6f4ee", color: "#047857", label: "Champion" };
  if (r.includes("technical")) return { bg: "#eef1f5", color: "#475569", label: "Technical Buyer" };
  if (r.includes("influencer")) return { bg: "#fbf1e3", color: "#b45309", label: "Influencer" };
  if (r.includes("end user") || r.includes("end_user")) return { bg: "#f1edfb", color: "#7c3aed", label: "End User" };
  return { bg: "#f0f0ec", color: "#6b7180", label: role ?? "Stakeholder" };
}

const AVATAR_COLORS = [
  { bg: "#eef0fb", color: "#4338ca" },
  { bg: "#e6f4ee", color: "#047857" },
  { bg: "#fbf1e3", color: "#b45309" },
  { bg: "#f1edfb", color: "#7c3aed" },
  { bg: "#eef1f5", color: "#475569" },
];

function buyerInitials(b: BuyerProfile): string {
  const name = b.full_name ?? `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim();
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function buyerName(b: BuyerProfile): string {
  const computed = b.full_name ?? `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim();
  return computed || "Unknown";
}

// Wrap a value for CSV: quote it and escape embedded quotes so commas/newlines
// inside names, titles or pain points don't break the column layout.
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function exportBuyersCsv(buyers: Array<BuyerProfile & { _domain: string }>): void {
  const headers = [
    "Name", "Title", "Company", "Domain", "Committee Role",
    "Email", "Phone", "LinkedIn", "Pain Points",
  ];
  const rows = buyers.map(b => [
    buyerName(b),
    b.current_title ?? b.title ?? "",
    b.company_name ?? b._domain,
    b._domain,
    roleMeta(b.committee_role).label,
    b.email ?? "",
    b.phone ?? "",
    b.linkedin_url ?? "",
    (b.pain_points ?? []).join("; "),
  ]);
  const csv = [headers, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  // Prepend a UTF-8 BOM so Excel renders accented characters correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `buyer-intel-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Skeleton({ w = "100%", h = 16, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec" }} />;
}

export default function BuyersPageV2() {
  const clientId = getActiveClientId();
  const queryClient = useQueryClient();
  const [reenriching, setReenriching] = useState(false);
  const [reenrichMsg, setReenrichMsg] = useState<string | null>(null);
  const [reenrichProgress, setReenrichProgress] = useState<{ withEmail: number; total: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear the polling interval if the component unmounts (page navigation).
  // The backend enrichment job keeps running server-side regardless.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleReenrich() {
    if (!clientId) return;
    setReenriching(true);
    setReenrichMsg(null);
    setReenrichProgress(null);

    // Stop any existing poll
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const { data } = await api.post("/api/buyers/discover", { client_id: clientId });
      const jobId: string = data.job_id;
      setReenrichMsg(`Job started (${jobId.slice(0, 8)}…) — polling for results…`);

      let attempts = 0;
      const MAX_ATTEMPTS = 240; // 20 minutes at 5s intervals — enrichment is slow (throttled)
      const DONE_STATUSES = ["complete", "complete_with_warnings", "failed"];

      const id = setInterval(async () => {
        attempts++;
        try {
          const { data: buyers } = await api.get("/api/buyers", { params: { client_id: clientId } });
          const allProfiles: Array<{ email?: string }> = Object.values(buyers.accounts ?? {}).flat() as Array<{ email?: string }>;
          const total = allProfiles.length;
          const withEmail = allProfiles.filter(p => p.email && p.email !== "not_found").length;
          setReenrichProgress({ withEmail, total });

          // Refresh the displayed cards live as emails land
          queryClient.invalidateQueries({ queryKey: ["buyers", clientId] });

          // Keep polling until the backend run itself reports completion.
          const runStatus: string = buyers?.meta?.status ?? "running";
          const isDone = DONE_STATUSES.includes(runStatus);

          if (isDone || attempts >= MAX_ATTEMPTS) {
            clearInterval(id);
            pollRef.current = null;
            setReenriching(false);
            if (isDone) {
              setReenrichMsg(`Done — ${withEmail}/${total} contacts have email. (${total - withEmail} not available in Apollo.)`);
            } else {
              setReenrichMsg(`Still running in background — ${withEmail}/${total} so far. Refresh this page in a few minutes for the rest.`);
            }
          } else {
            setReenrichMsg(`Enriching… ${withEmail}/${total} contacts have email so far`);
          }
        } catch {
          /* ignore poll errors */
        }
      }, 5000);

      pollRef.current = id;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data?: { detail?: string } } };
      const detail = axiosErr?.response?.data?.detail ?? String(err);
      console.error("[Re-enrich] POST /api/buyers/discover failed:", err);
      setReenrichMsg(`Failed (${axiosErr?.response?.status ?? "network error"}): ${detail}`);
      setReenriching(false);
    }
  }

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["buyers", clientId],
    queryFn: async () => {
      const { data } = await api.get<BuyerIntelPackage>("/api/buyers", {
        params: { client_id: clientId },
      });
      return data;
    },
  });

  // Flatten all buyers
  const allBuyers: Array<BuyerProfile & { _domain: string }> = [];
  if (rawData?.accounts) {
    Object.entries(rawData.accounts).forEach(([domain, profiles]) => {
      profiles.forEach(p => allBuyers.push({ ...p, _domain: domain }));
    });
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Buyer Intel</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>Mapped stakeholders across your target accounts</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => exportBuyersCsv(allBuyers)}
            disabled={allBuyers.length === 0}
            title={allBuyers.length === 0 ? "No buyer profiles to export" : "Export all buyer profiles to CSV"}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 7,
              border: "1px solid #e3e3df",
              background: allBuyers.length === 0 ? "#f7f7f5" : "#fff",
              cursor: allBuyers.length === 0 ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 500,
              color: allBuyers.length === 0 ? "#a3a7b3" : "#3a3f4c",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
          <button
            onClick={handleReenrich}
            disabled={reenriching}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 7,
              border: "1px solid #e3e3df",
              background: reenriching ? "#f7f7f5" : "#fff",
              cursor: reenriching ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 500,
              color: reenriching ? "#a3a7b3" : "#3a3f4c",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
            {reenriching ? "Starting…" : "Re-enrich contacts"}
          </button>
          </div>
          {reenrichMsg && (
            <span style={{ fontSize: 12, color: reenrichMsg.toLowerCase().includes("failed") ? "#dc2626" : "#047857" }}>
              {reenrichMsg}
              {reenrichProgress && reenriching && (
                <span style={{ color: "#8a8f9e", marginLeft: 6 }}>
                  ({reenrichProgress.withEmail}/{reenrichProgress.total} with email)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 14 }}>
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "16px 17px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
              <Skeleton w={42} h={42} r={21} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton w="60%" h={14} /><Skeleton w="80%" h={12} />
              </div>
            </div>
            <Skeleton h={12} /><div style={{ marginTop: 8 }}><Skeleton h={12} /></div>
          </div>
        ))}

        {!isLoading && allBuyers.map((b, i) => {
          const av = AVATAR_COLORS[i % AVATAR_COLORS.length];
          const role = roleMeta(b.committee_role);
          const name = buyerName(b);
          const title = b.current_title ?? b.title ?? "—";
          const pains = b.pain_points ?? [];

          return (
            <div key={i} style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "16px 17px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
                <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: "50%", background: av.bg, color: av.color, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 600 }}>
                  {buyerInitials(b)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 12, color: "#8a8f9e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13 }}>
                <span style={{ fontSize: 12, color: "#6b7180" }}>{b.company_name ?? b._domain}</span>
                <span style={{ color: "#d4d4cf" }}>·</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: role.bg, color: role.color }}>{role.label}</span>
              </div>

              {pains.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#a3a7b3", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 7 }}>Inferred pain points</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 15 }}>
                    {pains.map((p, j) => (
                      <span key={j} style={{ fontSize: 11.5, fontWeight: 500, padding: "3px 9px", borderRadius: 6, background: "#f5f5f1", color: "#5b6172", border: "1px solid #ededea" }}>{p}</span>
                    ))}
                  </div>
                </>
              )}

              {(b.email || b.phone) && (
                <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  {b.email && (
                    <div style={{ fontSize: 12, color: "#5b6172", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                      <a href={`mailto:${b.email}`} style={{ color: "#5b6172", textDecoration: "none", fontFamily: "monospace", fontSize: 11.5 }}>{b.email}</a>
                    </div>
                  )}
                  {b.phone && (
                    <div style={{ fontSize: 12, color: "#5b6172", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      <span style={{ fontFamily: "monospace", fontSize: 11.5 }}>{b.phone}</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, paddingTop: 13, borderTop: "1px solid #f2f2ee" }}>
                {b.linkedin_url ? (
                  <a href={b.linkedin_url} target="_blank" rel="noreferrer" style={{ flex: 1, height: 32, border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 500, color: "#3a3f4c", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.34 18.34V9.96H5.56v8.38zM6.95 8.72a1.61 1.61 0 1 0 0-3.22 1.61 1.61 0 0 0 0 3.22m11.39 9.62v-4.6c0-2.45-.53-4.34-3.39-4.34a2.97 2.97 0 0 0-2.68 1.47h-.04V9.96H9.57v8.38h2.78v-4.15c0-1.09.21-2.15 1.56-2.15 1.34 0 1.36 1.25 1.36 2.22v4.08z"/></svg>
                    LinkedIn
                  </a>
                ) : (
                  <button disabled style={{ flex: 1, height: 32, border: "1px solid #e3e3df", background: "#f7f7f5", borderRadius: 7, cursor: "not-allowed", fontSize: 12.5, fontWeight: 500, color: "#c4c4be", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.34 18.34V9.96H5.56v8.38zM6.95 8.72a1.61 1.61 0 1 0 0-3.22 1.61 1.61 0 0 0 0 3.22m11.39 9.62v-4.6c0-2.45-.53-4.34-3.39-4.34a2.97 2.97 0 0 0-2.68 1.47h-.04V9.96H9.57v8.38h2.78v-4.15c0-1.09.21-2.15 1.56-2.15 1.34 0 1.36 1.25 1.36 2.22v4.08z"/></svg>
                    LinkedIn
                  </button>
                )}
                {b.email ? (
                  <a href={`mailto:${b.email}`} style={{ flex: 1, height: 32, border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 500, color: "#3a3f4c", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                    Email
                  </a>
                ) : (
                  <button disabled style={{ flex: 1, height: 32, border: "1px solid #e3e3df", background: "#f7f7f5", borderRadius: 7, cursor: "not-allowed", fontSize: 12.5, fontWeight: 500, color: "#c4c4be", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                    Email
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!isLoading && allBuyers.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: "46px 18px", textAlign: "center", color: "#a3a7b3", fontSize: 13, background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6 }}>
            No buyer profiles found. Run Buyer Intel to discover stakeholders.
          </div>
        )}
      </div>
    </div>
  );
}
