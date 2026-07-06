import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

interface VerificationResult {
  contact_id?: string;
  full_name?: string;
  display_name?: string;
  email?: string;
  company_name?: string;
  account_domain?: string;
  email_status?: string;
  job_change_detected?: boolean;
  verified_at?: string;
  checked_at?: string;
  contact_title?: string;
}

interface VerifiedDataPackage {
  verifications?: VerificationResult[];
  meta?: { total_verified?: number; deliverable?: number; undeliverable?: number; risky?: number };
}

function relativeDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusMeta(result: VerificationResult) {
  if (result.job_change_detected) return { label: "Job Changed", bg: "#f1edfb", color: "#7c3aed", dot: "#6366f1" };
  const s = (result.email_status ?? "").toLowerCase();
  if (s === "verified" || s === "deliverable") return { label: "Verified", bg: "#e6f4ee", color: "#047857", dot: "#10b981" };
  if (s === "bounced" || s === "undeliverable") return { label: "Bounced", bg: "#fdeef0", color: "#be123c", dot: "#e11d48" };
  if (s === "pending" || s === "unknown" || !s) return { label: "Pending", bg: "#fbf1e3", color: "#b45309", dot: "#f59e0b" };
  return { label: result.email_status ?? "Unknown", bg: "#f0f0ec", color: "#6b7180", dot: "#c4c4be" };
}

function Skeleton({ w = "100%", h = 16, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "#f0f0ec" }} />;
}

export default function VerificationPageV2() {
  const clientId = getActiveClientId();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["verify", clientId],
    queryFn: async () => {
      const { data } = await api.get<VerifiedDataPackage>("/api/verify", {
        params: { client_id: clientId },
      });
      return data;
    },
  });

  const reverifyMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { data } = await api.post(`/api/verify/contact/${contactId}/recheck`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["verify", clientId] }),
  });

  const allResults: VerificationResult[] = data?.verifications ?? [];

  const verified = data?.meta?.deliverable ?? allResults.filter(r => !r.job_change_detected && (r.email_status === "verified" || r.email_status === "deliverable")).length;
  const bounced = data?.meta?.undeliverable ?? allResults.filter(r => r.email_status === "bounced" || r.email_status === "undeliverable").length;
  const pending = allResults.filter(r => !r.email_status || r.email_status === "pending" || r.email_status === "unknown").length;
  const jobChanged = allResults.filter(r => r.job_change_detected).length;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Verification</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#8a8f9e" }}>Contact deliverability across your verified pool</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
        {[
          { label: "Verified", value: verified, dot: "#10b981" },
          { label: "Bounced", value: bounced, dot: "#e11d48" },
          { label: "Pending", value: pending, dot: "#f59e0b" },
          { label: "Job Changed", value: jobChanged, dot: "#6366f1" },
        ].map(({ label, value, dot }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, padding: "15px 17px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "#8a8f9e" }}>{label}</span>
            </div>
            {isLoading ? <Skeleton w={60} h={25} /> : (
              <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</span>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <section style={{ background: "#fff", border: "1px solid #e7e7e3", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.4fr 1.6fr 1.2fr 1fr 110px", gap: 14, padding: "11px 18px", borderBottom: "1px solid #eeeeea", fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: "#a3a7b3" }}>
          <span>Contact</span><span>Company</span><span>Status</span><span>Last checked</span><span />
        </div>

        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2.4fr 1.6fr 1.2fr 1fr 110px", gap: 14, alignItems: "center", padding: "12px 18px", borderBottom: "1px solid #f2f2ee" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}><Skeleton w="60%" h={13} /><Skeleton w="80%" h={11} /></div>
            <Skeleton w="60%" h={13} />
            <Skeleton w={80} h={20} r={20} />
            <Skeleton w={60} h={12} />
            <span />
          </div>
        ))}

        {!isLoading && allResults.map((c, i) => {
          const st = statusMeta(c);
          const name = c.display_name || c.full_name || "Unknown";
          const company = c.company_name ?? c.account_domain ?? "—";
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2.4fr 1.6fr 1.2fr 1fr 110px", gap: 14, alignItems: "center", padding: "12px 18px", borderBottom: "1px solid #f2f2ee" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 11.5, color: "#a3a7b3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.email ?? "—"}</div>
              </div>
              <span style={{ fontSize: 13, color: "#3a3f4c" }}>{company}</span>
              <span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: st.bg, color: st.color }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
                  {st.label}
                </span>
              </span>
              <span style={{ fontSize: 12.5, color: "#8a8f9e" }}>{relativeDate(c.verified_at ?? c.checked_at)}</span>
              <span style={{ textAlign: "right" }}>
                <button
                  onClick={() => c.contact_id && reverifyMutation.mutate(c.contact_id)}
                  disabled={!c.contact_id || reverifyMutation.isPending}
                  style={{ height: 30, padding: "0 12px", border: "1px solid #e3e3df", background: "#fff", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 500, color: "#3a3f4c", display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                  Re-verify
                </button>
              </span>
            </div>
          );
        })}

        {!isLoading && allResults.length === 0 && (
          <div style={{ padding: "46px 18px", textAlign: "center", color: "#a3a7b3", fontSize: 13 }}>
            No verification results yet. Run Verification to check contact deliverability.
          </div>
        )}
      </section>
    </div>
  );
}
