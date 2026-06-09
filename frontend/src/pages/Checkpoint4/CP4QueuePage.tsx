import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { getActiveClientId } from "@/lib/session";
import { useAcceptHandoff, useCP4Queue, useRejectHandoff } from "./hooks";
import type { CP4Status, SalesHandoffNote } from "./types";

type FilterKey = "ALL" | CP4Status;

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: "ALL", label: "All Leads" },
  { value: "PENDING", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
];

function EngagementRing({ score }: { score: number; status: CP4Status }) {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? "#f59e0b" : score >= 60 ? "#3b82f6" : "#94a3b8";
  return (
    <div style={{ position: "relative", width: 80, height: 80 }}>
      <svg width="80" height="80" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color }}>{score}</div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: CP4Status }) {
  const styles: Record<CP4Status, { bg: string; fg: string; icon: string }> = {
    PENDING:   { bg: "#fffbeb", fg: "#92400e", icon: "⏳" },
    ACCEPTED:  { bg: "#f0fdf4", fg: "#15803d", icon: "✓" },
    REJECTED:  { bg: "#fef2f2", fg: "#b91c1c", icon: "✕" },
    ESCALATED: { bg: "#fef2f2", fg: "#b91c1c", icon: "⚑" },
  };
  const s = styles[status];
  return (
    <span style={{ padding: "4px 10px", borderRadius: 999, background: s.bg, color: s.fg, fontSize: 12, fontWeight: 700 }}>
      {s.icon} {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function LeadCard({ handoff, clientId }: { handoff: SalesHandoffNote; clientId: string }) {
  const accept = useAcceptHandoff(clientId);
  const reject = useRejectHandoff(clientId);
  const whyText = handoff.tldr_text
    .split("\n")
    .filter((l) => !l.startsWith("[CP4 Handoff]"))
    .join(" ")
    .trim()
    .slice(0, 120);

  const isTerminal = handoff.status === "ACCEPTED" || handoff.status === "REJECTED" || handoff.status === "ESCALATED";

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: `2px solid ${handoff.status === "PENDING" ? "#fde68a" : handoff.status === "ACCEPTED" ? "#bbf7d0" : "#fecaca"}`, padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>{handoff.contact_id.split("-")[0]}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{handoff.account_domain}</div>
        </div>
        <StatusChip status={handoff.status} />
      </div>

      {/* Engagement ring */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <EngagementRing score={handoff.engagement_score} status={handoff.status} />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8" }}>Engagement</div>
      </div>

      {/* Why qualified */}
      <div style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
        <strong style={{ color: "#0f172a" }}>Why this lead:</strong> {whyText || "High engagement across touchpoints."}
      </div>

      {/* Actions */}
      {!isTerminal && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
          <button
            disabled={accept.isPending}
            onClick={() => accept.mutate({ handoffId: handoff.handoff_id, acceptedBy: "operator" })}
            style={{ padding: "10px", borderRadius: 10, border: "none", background: "#15803d", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            ✓ Accept Lead
          </button>
          <button
            disabled={reject.isPending}
            onClick={() => {
              reject.mutate({ handoffId: handoff.handoff_id, reason: "Not qualified", rejectedBy: "operator" });
            }}
            style={{ padding: "10px", borderRadius: 10, border: "1.5px solid #fecaca", background: "#fff", color: "#b91c1c", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            ✕ Reject Lead
          </button>
        </div>
      )}
    </div>
  );
}

export default function CP4QueuePage() {
  const [search] = useSearchParams();
  const clientId = search.get("client_id") || getActiveClientId();
  const queue = useCP4Queue(clientId);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [nameSearch, setNameSearch] = useState("");

  const visibleHandoffs = useMemo(() => {
    if (!queue.data) return [] as SalesHandoffNote[];
    let items = queue.data.handoffs;
    if (filter !== "ALL") items = items.filter((h) => h.status === filter);
    if (nameSearch.trim()) items = items.filter((h) => h.account_domain.includes(nameSearch.toLowerCase()) || h.contact_id.includes(nameSearch.toLowerCase()));
    return items;
  }, [queue.data, filter, nameSearch]);

  const summary = queue.data?.summary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header card */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "24px 28px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Sales Operations</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a" }}>Sales Acceptance</h1>
        <p style={{ margin: "6px 0 16px", fontSize: 14, color: "#64748b", maxWidth: 480, lineHeight: 1.5 }}>
          Review qualified leads and accept or reject them with optional notes. Accepted leads are immediately handed off to the AE.
        </p>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => {
            const count = f.value === "ALL"
              ? (summary?.total ?? 0)
              : f.value === "PENDING" ? (summary?.pending ?? 0)
              : f.value === "ACCEPTED" ? (summary?.accepted ?? 0)
              : (summary?.rejected ?? 0);
            const active = filter === f.value;
            return (
              <button key={f.value} onClick={() => setFilter(f.value)} style={{
                padding: "7px 16px",
                borderRadius: 999,
                border: `1.5px solid ${active ? "#0f172a" : "#e2e8f0"}`,
                background: active ? "#0f172a" : "#fff",
                color: active ? "#fff" : "#374151",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                {f.label}
                <span style={{ background: active ? "rgba(255,255,255,0.2)" : "#f1f5f9", color: active ? "#fff" : "#475569", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 700 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search by name or company..."
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
          style={{ flex: 1, padding: "10px 16px", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", background: "#fff" }}
        />
        <span style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>{visibleHandoffs.length} leads</span>
      </div>

      {/* Content */}
      {queue.isLoading ? (
        <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner size="lg" label="Loading handoffs…" />
        </div>
      ) : queue.isError ? (
        <div style={{ background: "#f8fafc", border: "2px dashed #e2e8f0", borderRadius: 16, padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          Could not load CP4 queue. Retry shortly.
        </div>
      ) : visibleHandoffs.length === 0 ? (
        <div style={{ background: "#f8fafc", border: "2px dashed #e2e8f0", borderRadius: 16, padding: "56px 24px", textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 6 }}>No leads yet</div>
          <div style={{ fontSize: 14, color: "#64748b" }}>
            {filter === "ALL"
              ? "The Campaign agent will create leads as engagement crosses the threshold."
              : `No leads in ${filter.toLowerCase()} state.`}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {visibleHandoffs.map((h) => (
            <LeadCard key={h.handoff_id} handoff={h} clientId={clientId} />
          ))}
        </div>
      )}
    </div>
  );
}
