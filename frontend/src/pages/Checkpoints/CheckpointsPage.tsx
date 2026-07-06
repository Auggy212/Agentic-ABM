import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

interface CP2Item {
  account_id?: string;
  account_name?: string;
  domain?: string;
  account_domain?: string;
  tier?: string;
  icp_score?: number;
  industry?: string;
  status?: string;
  account_decision?: string;
}

interface CP3Message {
  id?: string;
  account_domain?: string;
  subject?: string;
  persona?: string;
  template_id?: string;
  status?: string;
}

type CpTab = "CP2" | "CP3" | "CP4";

const CP_TABS: { key: CpTab; label: string }[] = [
  { key: "CP2", label: "CP2 — ICP Scout" },
  { key: "CP3", label: "CP3 — Storyteller" },
  { key: "CP4", label: "CP4 — Handoff" },
];

function initials(name: string | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function Skeleton({ w = "100%", h = 16, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec" }} />;
}

export default function CheckpointsPage() {
  const clientId = getActiveClientId();
  const [activeTab, setActiveTab] = useState<CpTab>("CP2");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();

  const { data: cp2Data, isLoading: cp2Loading } = useQuery({
    queryKey: ["cp2-review", clientId],
    queryFn: async () => {
      const { data } = await api.get("/api/checkpoint-2", { params: { client_id: clientId } });
      return data;
    },
    enabled: activeTab === "CP2",
  });

  const { data: cp3Data, isLoading: cp3Loading } = useQuery({
    queryKey: ["cp3-messages", clientId],
    queryFn: async () => {
      const { data } = await api.get("/api/checkpoint-3", { params: { client_id: clientId } });
      return data;
    },
    enabled: activeTab === "CP3",
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, checkpoint }: { id: string; checkpoint: string }) => {
      if (checkpoint === "CP2") {
        // id is the account domain for CP2
        const { data } = await api.post(
          `/api/checkpoint-2/accounts/${encodeURIComponent(id)}/approve`,
          { reviewer: "operator", account_notes: notes },
          { params: { client_id: clientId } },
        );
        return data;
      }
      if (checkpoint === "CP3") {
        const { data } = await api.post(
          "/api/checkpoint-3/approve",
          { reviewer: "operator", reviewer_notes: notes },
          { params: { client_id: clientId } },
        );
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cp2-review", clientId] });
      qc.invalidateQueries({ queryKey: ["cp3-messages", clientId] });
      setSelectedId(null);
      setNotes("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, checkpoint }: { id: string; checkpoint: string }) => {
      if (checkpoint === "CP2") {
        const { data } = await api.post(
          `/api/checkpoint-2/accounts/${encodeURIComponent(id)}/remove`,
          { reviewer: "operator", reason: notes || "Rejected by operator" },
          { params: { client_id: clientId } },
        );
        return data;
      }
      if (checkpoint === "CP3") {
        const { data } = await api.post(
          "/api/checkpoint-3/reject",
          { reviewer: "operator", reviewer_notes: notes },
          { params: { client_id: clientId } },
        );
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cp2-review", clientId] });
      qc.invalidateQueries({ queryKey: ["cp3-messages", clientId] });
      setSelectedId(null);
      setNotes("");
    },
  });

  // Build items list based on active tab
  type Item = { id: string; title: string; meta: string };
  let items: Item[] = [];
  let isLoading = false;

  if (activeTab === "CP2") {
    isLoading = cp2Loading;
    // CP2 response has account_approvals: { domain: { account_domain, account_decision, ... } }
    const approvals: Record<string, CP2Item> = cp2Data?.account_approvals ?? {};
    items = Object.entries(approvals).map(([domain, a]) => ({
      id: domain,
      title: a.domain ?? domain,
      meta: `Decision: ${a.account_decision ?? "pending"} · ${domain}`,
    }));
    if (items.length === 0) {
      // Fallback for older shapes
      const accs: CP2Item[] = cp2Data?.accounts ?? cp2Data?.pending ?? [];
      items = accs.map((a, i) => ({
        id: a.account_id ?? a.domain ?? String(i),
        title: a.account_name ?? a.domain ?? "Unknown",
        meta: `Fit ${a.icp_score ?? "—"} · ${a.industry ?? "—"} · ${a.tier ?? "—"}`,
      }));
    }
  } else if (activeTab === "CP3") {
    isLoading = cp3Loading;
    // CP3 response has message_reviews: { message_id: { ... } }
    const reviews: Record<string, CP3Message> = cp3Data?.message_reviews ?? {};
    items = Object.entries(reviews).map(([msgId, m]) => ({
      id: msgId,
      title: `${m.account_domain ?? "Unknown"} — ${m.template_id ?? "email"}`,
      meta: `${m.persona ?? "—"} · ${m.status ?? "Pending review"}`,
    }));
    if (items.length === 0) {
      const msgs: CP3Message[] = cp3Data?.messages ?? [];
      items = msgs.map((m, i) => ({
        id: m.id ?? String(i),
        title: `${m.account_domain ?? "Unknown"} — ${m.template_id ?? "email"}`,
        meta: `${m.persona ?? "—"} · ${m.status ?? "Pending review"}`,
      }));
    }
  }

  const selectedItem = items.find(it => it.id === selectedId);
  const cpPhaseLabel = activeTab === "CP2" ? "Phase 2" : activeTab === "CP3" ? "Phase 3" : "Phase 4";
  const cpBanner = activeTab === "CP2"
    ? "Review ICP Scout results before running Buyer Intel and Signal Intel."
    : activeTab === "CP3"
    ? "Review generated messages before launching campaigns."
    : "Final approval before campaign send.";

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Checkpoints</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>Operator review gates before each phase advances</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {CP_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedId(null); }}
            style={{ height: 34, padding: "0 16px", border: `1px solid ${activeTab === tab.key ? "#4338ca" : "#e3e3df"}`, background: activeTab === tab.key ? "#eef0fb" : "#fff", color: activeTab === tab.key ? "#4338ca" : "#6b7180", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lock banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", border: "1px solid #f0d9b8", background: "#fdf6e9", borderRadius: 8, marginBottom: 18 }}>
        <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: "#fbeccb", color: "#b45309", display: "grid", placeItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#7c4a0a" }}>{cpPhaseLabel} is locked pending review</div>
          <div style={{ fontSize: 12, color: "#9a6a2a", marginTop: 1 }}>{cpBanner}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#fbeccb", color: "#b45309" }}>
          {items.length} pending
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, alignItems: "start" }}>
        {/* Item list */}
        <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #eeeeea" }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              {activeTab === "CP2" ? "Accounts to review" : activeTab === "CP3" ? "Messages to review" : "Contacts to review"}
            </h2>
          </div>

          {isLoading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 18px", borderBottom: "1px solid #f2f2ee" }}>
              <Skeleton w={32} h={32} r={7} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton w="50%" h={13} /><Skeleton w="70%" h={11} />
              </div>
              <Skeleton w={32} h={32} r={7} />
              <Skeleton w={32} h={32} r={7} />
            </div>
          ))}

          {!isLoading && items.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 18px", borderBottom: "1px solid #f2f2ee", cursor: "pointer", background: selectedId === item.id ? "#f4f4fb" : undefined, transition: "background .1s" }}
              onMouseEnter={e => { if (selectedId !== item.id) e.currentTarget.style.background = "#f9f9ff"; }}
              onMouseLeave={e => { if (selectedId !== item.id) e.currentTarget.style.background = ""; }}
            >
              <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 7, background: "#f0f0ec", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#6b7180" }}>
                {initials(item.title)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#8a8f9e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.meta}</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); rejectMutation.mutate({ id: item.id, checkpoint: activeTab }); }}
                style={{ width: 32, height: 32, flexShrink: 0, border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", display: "grid", placeItems: "center", color: "#be123c" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
              </button>
              <button
                onClick={e => { e.stopPropagation(); approveMutation.mutate({ id: item.id, checkpoint: activeTab }); }}
                style={{ width: 32, height: 32, flexShrink: 0, border: "1px solid #4338ca", background: "#4338ca", borderRadius: 7, cursor: "pointer", display: "grid", placeItems: "center", color: "#fff" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          ))}

          {!isLoading && items.length === 0 && (
            <div style={{ padding: "46px 18px", textAlign: "center", color: "#a3a7b3", fontSize: 13 }}>
              All items reviewed. This phase is ready to advance.
            </div>
          )}
        </section>

        {/* Review panel */}
        <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "18px 19px" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Reviewer feedback</h2>
          {selectedItem ? (
            <div>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8a8f9e" }}>
                Reviewing <span style={{ color: "#1a1d29", fontWeight: 600 }}>{selectedItem.title}</span>
              </p>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3a3f4c", marginBottom: 6 }}>Notes</label>
              <textarea
                rows={5}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add context for the operator log…"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #e3e3df", borderRadius: 7, background: "#f7f7f5", font: "inherit", fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.5, marginBottom: 14, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 9 }}>
                <button
                  onClick={() => rejectMutation.mutate({ id: selectedItem.id, checkpoint: activeTab })}
                  disabled={rejectMutation.isPending}
                  style={{ flex: 1, height: 36, border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#be123c" }}
                >
                  Reject
                </button>
                <button
                  onClick={() => approveMutation.mutate({ id: selectedItem.id, checkpoint: activeTab })}
                  disabled={approveMutation.isPending}
                  style={{ flex: 1, height: 36, border: "1px solid #4338ca", background: "#4338ca", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#fff" }}
                >
                  Approve
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: "34px 6px", textAlign: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 9, background: "#f5f5f1", color: "#a3a7b3", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-6 0v4"/><path d="M5 9h14l1 12H4z"/></svg>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: "#a3a7b3", lineHeight: 1.5 }}>
                Select an item on the left to leave feedback before approving or rejecting.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
