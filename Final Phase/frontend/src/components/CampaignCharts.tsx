/**
 * CampaignCharts.tsx
 * Recharts-powered charts for the Campaign Dashboard.
 */
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const DAILY_DATA = [
  { day: "Mon", opens: 62, replies: 18, meetings: 3 },
  { day: "Tue", opens: 74, replies: 22, meetings: 4 },
  { day: "Wed", opens: 88, replies: 29, meetings: 6 },
  { day: "Thu", opens: 95, replies: 34, meetings: 5 },
  { day: "Fri", opens: 71, replies: 24, meetings: 4 },
  { day: "Sat", opens: 34, replies: 10, meetings: 1 },
  { day: "Sun", opens: 22, replies: 6,  meetings: 1 },
];

const CHANNEL_DATA = [
  { channel: "Email", delivered: 940, opened: 371, replied: 108 },
  { channel: "LinkedIn", delivered: 520, opened: 298, replied: 89  },
  { channel: "WhatsApp", delivered: 312, opened: 241, replied: 67  },
  { channel: "Reddit", delivered: 70,  opened: 28,  replied: 9   },
];

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "10px 14px",
        boxShadow: "0 4px 20px rgba(0,0,0,.08)",
        fontSize: 12,
      }}
    >
      <p style={{ fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, margin: "2px 0" }}>
          <span style={{ fontWeight: 600 }}>{p.name}:</span> {p.value}
        </p>
      ))}
    </div>
  );
}

export function CampaignCharts() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* Area chart — daily engagement */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-accent">7-day trend</p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">Daily Engagement</h3>
        <div className="mt-5" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={DAILY_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gOpens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gReplies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="opens" name="Opens" stroke="#6366f1" strokeWidth={2} fill="url(#gOpens)" />
              <Area type="monotone" dataKey="replies" name="Replies" stroke="#10b981" strokeWidth={2} fill="url(#gReplies)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar chart — channel breakdown */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-accent">Channel breakdown</p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">Delivered vs Opened vs Replied</h3>
        <div className="mt-5" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={CHANNEL_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barSize={14}>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="delivered" name="Delivered" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="opened" name="Opened" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="replied" name="Replied" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
