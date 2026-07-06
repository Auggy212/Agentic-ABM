import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

interface CampaignRun {
  id?: string;
  client_id?: string;
  started_at?: string;
  finished_at?: string;
  status?: string;
  sends_attempted?: number;
  sends_succeeded?: number;
  errors?: string[];
}

interface OutboundSend {
  id?: string;
  contact_id?: string;
  account_domain?: string;
  subject?: string;
  attempted_at?: string;
  status?: string;
  email?: string;
  to_email?: string;
  to_name?: string;
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

function campaignStatusMeta(status: string | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "done") return { label: "Completed", bg: "#e6f4ee", color: "#047857", dot: "#10b981" };
  if (s === "running" || s === "active") return { label: "Active", bg: "#eef0fb", color: "#4338ca", dot: "#4338ca" };
  if (s === "paused") return { label: "Paused", bg: "#fbf1e3", color: "#b45309", dot: "#f59e0b" };
  if (s === "failed") return { label: "Failed", bg: "#fdeef0", color: "#be123c", dot: "#e11d48" };
  return { label: status ?? "Unknown", bg: "#f0f0ec", color: "#6b7180", dot: "#c4c4be" };
}

function sendStatusMeta(status: string | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "sent" || s === "delivered") return { label: "Sent", bg: "#e6f4ee", color: "#047857" };
  if (s === "opened") return { label: "Opened", bg: "#eef0fb", color: "#4338ca" };
  if (s === "bounced" || s === "failed") return { label: "Bounced", bg: "#fdeef0", color: "#be123c" };
  return { label: status ?? "Pending", bg: "#f0f0ec", color: "#6b7180" };
}

function Skeleton({ w = "100%", h = 16, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec" }} />;
}

export default function CampaignsPageV2() {
  const clientId = getActiveClientId();
  const qc = useQueryClient();

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["campaign-runs", clientId],
    queryFn: async () => {
      const { data } = await api.get<{ runs: CampaignRun[] }>("/api/campaign/runs", {
        params: { client_id: clientId },
      });
      return data;
    },
    refetchInterval: 15_000,
  });

  const { data: sendsData, isLoading: sendsLoading } = useQuery({
    queryKey: ["campaign-sends", clientId],
    queryFn: async () => {
      const { data } = await api.get<{ sends: OutboundSend[] }>("/api/campaign/sends", {
        params: { client_id: clientId, limit: 50 },
      });
      return data;
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/api/campaign/run?client_id=${clientId}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-runs", clientId] });
    },
  });

  const runs = runsData?.runs ?? [];
  const sends = sendsData?.sends ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Campaigns</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>Active and completed outreach runs</p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          style={{ height: 36, padding: "0 16px", border: "1px solid #4338ca", background: runMutation.isPending ? "#6b7fcb" : "#4338ca", borderRadius: 7, cursor: runMutation.isPending ? "not-allowed" : "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 7 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          {runMutation.isPending ? "Starting…" : "Run Campaign"}
        </button>
      </div>

      {runMutation.isError && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fdeef0", border: "1px solid #f6c9d2", borderRadius: 8, fontSize: 13, color: "#be123c" }}>
          {(runMutation.error as any)?.response?.data?.detail ?? "Failed to start campaign."}
        </div>
      )}

      {/* Campaign cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 20 }}>
        {runsLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "16px 17px" }}>
            <div style={{ marginBottom: 16 }}><Skeleton w="70%" h={14} /></div>
            <div style={{ display: "flex", gap: 6 }}>
              <Skeleton w={50} h={32} /><Skeleton w={50} h={32} /><Skeleton w={50} h={32} />
            </div>
          </div>
        ))}
        {!runsLoading && runs.map((run, i) => {
          const st = campaignStatusMeta(run.status);
          const sends_n = run.sends_attempted ?? 0;
          return (
            <div key={i} style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "16px 17px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Campaign {run.id?.slice(0, 8) ?? `#${i + 1}`}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: st.bg, color: st.color, flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
                  {st.label}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>{sends_n}</div>
                  <div style={{ fontSize: 11, color: "#a3a7b3", marginTop: 1 }}>Sends</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>—</div>
                  <div style={{ fontSize: 11, color: "#a3a7b3", marginTop: 1 }}>Open rate</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", color: "#4338ca" }}>—</div>
                  <div style={{ fontSize: 11, color: "#a3a7b3", marginTop: 1 }}>Reply rate</div>
                </div>
              </div>
            </div>
          );
        })}
        {!runsLoading && runs.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: "32px", textAlign: "center", color: "#a3a7b3", fontSize: 13, background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6 }}>
            No campaigns yet. Click "Run Campaign" to start.
          </div>
        )}
      </div>

      {/* Recent sends */}
      <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #eeeeea" }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Recent sends</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 2.2fr 1fr 0.7fr", gap: 14, padding: "11px 18px", borderBottom: "1px solid #eeeeea", fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: "#a3a7b3" }}>
          <span>Recipient</span><span>Account</span><span>Subject</span><span>Status</span><span>Sent</span>
        </div>

        {sendsLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 2.2fr 1fr 0.7fr", gap: 14, alignItems: "center", padding: "12px 18px", borderBottom: "1px solid #f2f2ee" }}>
            <Skeleton w="70%" h={13} /><Skeleton w="60%" h={13} /><Skeleton w="90%" h={13} /><Skeleton w={60} h={20} r={20} /><Skeleton w={50} h={12} />
          </div>
        ))}

        {!sendsLoading && sends.map((s, i) => {
          const st = sendStatusMeta(s.status);
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 2.2fr 1fr 0.7fr", gap: 14, alignItems: "center", padding: "12px 18px", borderBottom: "1px solid #f2f2ee" }}>
              <span style={{ fontSize: 13, color: "#3a3f4c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.to_name ?? s.to_email ?? s.email ?? "—"}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.account_domain ?? "—"}</span>
              <span style={{ fontSize: 13, color: "#6b7180", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.subject ?? "—"}</span>
              <span><span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span></span>
              <span style={{ fontSize: 12, color: "#a3a7b3" }}>{relativeTime(s.attempted_at)}</span>
            </div>
          );
        })}

        {!sendsLoading && sends.length === 0 && (
          <div style={{ padding: "36px 18px", textAlign: "center", color: "#a3a7b3", fontSize: 13 }}>No sends yet.</div>
        )}
      </section>
    </div>
  );
}
