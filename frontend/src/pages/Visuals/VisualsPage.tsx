import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  listVisualAssets,
  prepareVisuals,
  type VisualAsset,
} from "@/lib/api";
import { getActiveClientId } from "@/lib/session";

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL:                "Email",
  LINKEDIN_DM:          "LinkedIn DM",
  LINKEDIN_CONNECTION:  "LinkedIn Connection",
  WHATSAPP:             "WhatsApp",
  REDDIT_STRATEGY_NOTE: "Reddit Strategy",
};

const CHANNEL_COLOR: Record<string, string> = {
  EMAIL:                "var(--acc-500)",
  LINKEDIN_DM:          "#0ea5e9",
  LINKEDIN_CONNECTION:  "#0284c7",
  WHATSAPP:             "#22c55e",
  REDDIT_STRATEGY_NOTE: "#f97316",
};

const CHANNEL_GLYPH: Record<string, string> = {
  EMAIL:                "📧",
  LINKEDIN_DM:          "💼",
  LINKEDIN_CONNECTION:  "🔗",
  WHATSAPP:             "💬",
  REDDIT_STRATEGY_NOTE: "📝",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  PENDING:    { bg: "var(--warn-50,#fffbeb)",  fg: "#92400e", border: "#fde68a", label: "Pending" },
  GENERATING: { bg: "var(--acc-50)",           fg: "var(--acc-700)", border: "var(--acc-200)", label: "Generating" },
  READY:      { bg: "var(--good-50)",          fg: "var(--good-700)", border: "var(--good-100)", label: "Ready" },
  FAILED:     { bg: "var(--bad-50)",           fg: "var(--bad-700)", border: "var(--bad-100)", label: "Failed" },
};

function AssetCard({ asset }: { asset: VisualAsset }) {
  const st  = STATUS_STYLE[asset.status] ?? STATUS_STYLE.PENDING;
  const col = CHANNEL_COLOR[asset.channel] ?? "var(--acc-500)";
  const glyph = CHANNEL_GLYPH[asset.channel] ?? "🖼";

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: "box-shadow 0.15s, transform 0.15s",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      {/* Thumbnail */}
      <div style={{
        height: 128,
        background: asset.thumbnail_url
          ? `url(${asset.thumbnail_url}) center/cover`
          : `linear-gradient(135deg, var(--surface-3), var(--surface-2))`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        borderBottom: "1px solid var(--border)",
      }}>
        {!asset.thumbnail_url && (
          <span style={{ fontSize: 36, opacity: 0.6 }}>{glyph}</span>
        )}
        {/* status pill */}
        <span style={{
          position: "absolute", top: 10, right: 10,
          background: st.bg, color: st.fg,
          border: `1px solid ${st.border}`,
          fontSize: 11, fontWeight: 700, borderRadius: 999,
          padding: "2px 10px",
        }}>
          {st.label}
        </span>
        {/* channel dot */}
        <span style={{
          position: "absolute", bottom: 10, left: 12,
          background: "var(--surface)", border: `1.5px solid ${col}`,
          color: col, fontSize: 10, fontWeight: 700,
          borderRadius: 999, padding: "2px 8px",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {CHANNEL_LABEL[asset.channel] ?? asset.channel}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
          {asset.account_domain}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5, flex: 1 }}>
          {asset.prompt_used.slice(0, 100)}{asset.prompt_used.length > 100 ? "…" : ""}
        </div>

        {asset.error_detail && (
          <div style={{
            fontSize: 11, color: "var(--bad-700)",
            background: "var(--bad-50)", border: "1px solid var(--bad-100)",
            borderRadius: 6, padding: "4px 8px", marginTop: 2,
          }}>
            {asset.error_detail}
          </div>
        )}

        {(asset.canva_edit_url || asset.canva_view_url) && (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {asset.canva_edit_url && (
              <a
                href={asset.canva_edit_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 11, fontWeight: 600,
                  color: "var(--acc-600)", background: "var(--acc-50)",
                  border: "1px solid var(--acc-100)",
                  borderRadius: 7, padding: "3px 10px", textDecoration: "none",
                }}
              >
                Edit in Canva
              </a>
            )}
            {asset.canva_view_url && (
              <a
                href={asset.canva_view_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 11, fontWeight: 600,
                  color: "var(--text-2)", background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 7, padding: "3px 10px", textDecoration: "none",
                }}
              >
                View
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const CHANNELS = ["ALL", "EMAIL", "LINKEDIN_DM", "LINKEDIN_CONNECTION", "WHATSAPP", "REDDIT_STRATEGY_NOTE"];
const STATUSES = ["ALL", "PENDING", "GENERATING", "READY", "FAILED"];

export default function VisualsPage() {
  const clientId = getActiveClientId();
  const qc = useQueryClient();
  const [filterChannel, setFilterChannel] = useState("ALL");
  const [filterStatus,  setFilterStatus]  = useState("ALL");

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["visual-assets", clientId],
    queryFn: () => listVisualAssets(clientId!),
    enabled: !!clientId,
    refetchInterval: 5_000,
  });

  const prepare = useMutation({
    mutationFn: () => prepareVisuals(clientId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visual-assets", clientId] }),
  });

  const filtered = assets.filter((a) =>
    (filterChannel === "ALL" || a.channel === filterChannel) &&
    (filterStatus  === "ALL" || a.status  === filterStatus)
  );

  const ready    = assets.filter((a) => a.status === "READY").length;
  const pending  = assets.filter((a) => a.status === "PENDING" || a.status === "GENERATING").length;
  const failed   = assets.filter((a) => a.status === "FAILED").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Hero ── */}
      <div className="page-hero">
        <div className="ph-left">
          <div className="ph-eyebrow">Visual Agent</div>
          <h1 className="ph-title">Campaign Visuals</h1>
          <p className="ph-subtitle">
            Canva-generated assets for approved campaign messages — one per message, per channel.
          </p>
        </div>
        <div className="ph-kpis">
          <div className="ph-kpi">
            <div className="ph-kpi-label">Total</div>
            <div className="ph-kpi-num">{assets.length}</div>
          </div>
          <div className="ph-kpi" data-tone={ready > 0 ? "green" : undefined}>
            <div className="ph-kpi-label">Ready</div>
            <div className="ph-kpi-num">{ready}</div>
          </div>
          <div className="ph-kpi" data-tone={pending > 0 ? "amber" : undefined}>
            <div className="ph-kpi-label">Pending</div>
            <div className="ph-kpi-num">{pending}</div>
          </div>
          <div className="ph-kpi" data-tone={failed > 0 ? "red" : undefined}>
            <div className="ph-kpi-label">Failed</div>
            <div className="ph-kpi-num">{failed}</div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Action bar ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
        }}>
          {/* Channel filter */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>Channel</span>
            {CHANNELS.map((ch) => (
              <button
                key={ch}
                onClick={() => setFilterChannel(ch)}
                style={{
                  padding: "4px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: filterChannel === ch ? "1.5px solid var(--acc-500)" : "1.5px solid var(--border)",
                  background: filterChannel === ch ? "var(--acc-50)" : "var(--surface)",
                  color: filterChannel === ch ? "var(--acc-600)" : "var(--text-3)",
                }}
              >
                {ch === "ALL" ? "All" : (CHANNEL_LABEL[ch] ?? ch)}
              </button>
            ))}
          </div>

          {/* Status filter + generate button */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>Status</span>
            {STATUSES.map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                style={{
                  padding: "4px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: filterStatus === st ? "1.5px solid var(--border-strong)" : "1.5px solid var(--border)",
                  background: filterStatus === st ? "var(--surface-3)" : "var(--surface)",
                  color: filterStatus === st ? "var(--text)" : "var(--text-3)",
                }}
              >
                {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <button
            className="btn-primary"
            onClick={() => prepare.mutate()}
            disabled={prepare.isPending || !clientId}
            style={{ fontSize: 13, padding: "8px 18px", flexShrink: 0 }}
          >
            {prepare.isPending ? "Preparing…" : "Generate Visuals"}
          </button>
        </div>

        {/* ── Success toast ── */}
        {prepare.isSuccess && (
          <div style={{
            background: "var(--good-50)", border: "1px solid var(--good-100)",
            borderRadius: 10, padding: "10px 16px",
            fontSize: 13, color: "var(--good-700)", fontWeight: 600,
          }}>
            {(prepare.data as { message?: string })?.message ?? "Visuals queued successfully."}
          </div>
        )}

        {/* ── Grid / Empty ── */}
        {isLoading ? (
          <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LoadingSpinner size="lg" label="Loading visual assets…" />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            background: "var(--surface)", border: "1.5px dashed var(--border-strong)",
            borderRadius: 14, padding: "60px 24px", textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>🎨</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 6 }}>
              {assets.length === 0 ? "No visuals yet" : "No matches"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 360, margin: "0 auto" }}>
              {assets.length === 0
                ? "Click Generate Visuals to create Canva assets for your approved campaign messages."
                : "Try adjusting the channel or status filters."}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {filtered.map((asset) => <AssetCard key={asset.id} asset={asset} />)}
          </div>
        )}
      </div>
    </div>
  );
}
