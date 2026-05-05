import LoadingSpinner from "@/components/ui/LoadingSpinner";
import BuyerCard from "./BuyerCard";
import BuyersEmpty from "./BuyersEmpty";
import BuyersHeader from "./BuyersHeader";
import { useBuyersByAccount, useQuotaStatus } from "./hooks";
import type { BuyerProfile, CommitteeRole } from "./types";

// ── Role group definitions ─────────────────────────────────────────────────

interface RoleGroup {
  role: CommitteeRole;
  label: string;
  icon: string;
  expected: string;
  emptyText: string;
}

const ROLE_GROUPS: RoleGroup[] = [
  {
    role: "DECISION_MAKER",
    label: "Decision-Maker",
    icon: "⬢",
    expected: "1 expected",
    emptyText: "No decision-maker found — Apollo returned no C-suite or VP-level matches.",
  },
  {
    role: "CHAMPION",
    label: "Champions",
    icon: "⬡",
    expected: "1–2 expected",
    emptyText: "No champions found — Apollo returned no matches at this seniority.",
  },
  {
    role: "BLOCKER",
    label: "Blockers",
    icon: "⬢",
    expected: "0–1 expected",
    emptyText: "No blockers identified — no gate-keeping function contacts found.",
  },
  {
    role: "INFLUENCER",
    label: "Influencers",
    icon: "⬡",
    expected: "0–1 expected",
    emptyText: "No influencers found — all contacts mapped to other roles.",
  },
];

const GROUP_HEADER_COLORS: Record<CommitteeRole, { accent: string; dim: string }> = {
  DECISION_MAKER: { accent: "#4338ca", dim: "#eef2ff" },
  CHAMPION: { accent: "#15803d", dim: "#f0fdf4" },
  BLOCKER: { accent: "#b91c1c", dim: "#fef2f2" },
  INFLUENCER: { accent: "var(--text-2)", dim: "var(--surface-2)" },
};

// ── Role group section ─────────────────────────────────────────────────────

function RoleGroupSection({
  group,
  contacts,
}: {
  group: RoleGroup;
  contacts: BuyerProfile[];
}) {
  const colors = GROUP_HEADER_COLORS[group.role];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Group header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: colors.dim,
          borderRadius: 8,
        }}
      >
        <span style={{ fontSize: 14, color: colors.accent }}>{group.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.accent }}>
          {group.label}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "1px 7px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.08)",
            color: colors.accent,
            fontWeight: 600,
          }}
        >
          {contacts.length}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>
          {group.expected}
        </span>
      </div>

      {contacts.length === 0 ? (
        <div
          style={{
            padding: "14px 18px",
            fontSize: 13,
            color: "var(--text-3)",
            fontStyle: "italic",
            background: "var(--surface-2)",
            borderRadius: 8,
            border: "1px dashed var(--border)",
          }}
        >
          {group.emptyText}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contacts.map((c) => (
            <BuyerCard key={c.contact_id} contact={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────

interface BuyersTabProps {
  domain: string;
}

export default function BuyersTab({ domain }: BuyersTabProps) {
  const { data, isLoading, isError } = useBuyersByAccount(domain);
  const { data: quota } = useQuotaStatus();

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 240,
        }}
      >
        <LoadingSpinner size="lg" label="Loading buyer committee…" />
      </div>
    );
  }

  if (isError || !data) {
    // No buyers discovered yet → show trigger UI
    return <BuyersEmpty domain={domain} />;
  }

  const contacts = data.contacts;

  if (contacts.length === 0) {
    return <BuyersEmpty domain={domain} />;
  }

  // Group by committee role
  const grouped: Record<CommitteeRole, BuyerProfile[]> = {
    DECISION_MAKER: [],
    CHAMPION: [],
    BLOCKER: [],
    INFLUENCER: [],
  };
  for (const c of contacts) {
    grouped[c.committee_role].push(c);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <BuyersHeader contacts={contacts} quota={quota} domain={domain} />

      {ROLE_GROUPS.map((group) => (
        <RoleGroupSection
          key={group.role}
          group={group}
          contacts={grouped[group.role]}
        />
      ))}
    </div>
  );
}
