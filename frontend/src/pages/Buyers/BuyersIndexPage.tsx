import { useState } from "react";
import { Link } from "react-router-dom";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import BuyerCard from "@/pages/Accounts/buyers/BuyerCard";
import { useBuyersByClient } from "@/pages/Accounts/buyers/hooks";
import type { AccountTier } from "@/pages/Accounts/types";
import type {
  BuyerProfile,
  CommitteeRole,
  EmailStatus,
} from "@/pages/Accounts/buyers/types";

const DEFAULT_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

type TierFilter = "ALL" | AccountTier;
type RoleFilter = "ALL" | CommitteeRole;
type EmailFilter = "ALL" | EmailStatus;

interface Filters {
  tier: TierFilter;
  role: RoleFilter;
  email: EmailFilter;
  jobChange: boolean;
}

const TIER_LABELS: Record<string, string> = {
  ALL: "All tiers",
  TIER_1: "Tier 1",
  TIER_2: "Tier 2",
  TIER_3: "Tier 3",
};

const ROLE_LABELS: Record<string, string> = {
  ALL: "All roles",
  DECISION_MAKER: "Decision-Maker",
  CHAMPION: "Champion",
  BLOCKER: "Blocker",
  INFLUENCER: "Influencer",
};

const EMAIL_LABELS: Record<string, string> = {
  ALL: "All email statuses",
  VALID: "Valid",
  CATCH_ALL: "Catch-all",
  UNVERIFIED: "Unverified",
  INVALID: "Invalid",
  NOT_FOUND: "Not found",
};

function SelectFilter<T extends string>({
  value,
  onChange,
  options,
  labels,
}: {
  value: T;
  onChange: (v: T) => void;
  options: T[];
  labels: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        fontSize: 13,
        background: "white",
        cursor: "pointer",
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {labels[opt]}
        </option>
      ))}
    </select>
  );
}

// Very rough tier from domain order (aligned to mock data)
const DOMAIN_TIER: Record<string, AccountTier> = {
  "signal-1.example.com": "TIER_1",
  "signal-2.example.com": "TIER_1",
  "signal-3.example.com": "TIER_1",
  "signal-4.example.com": "TIER_1",
  "signal-5.example.com": "TIER_2",
  "signal-6.example.com": "TIER_2",
  "signal-7.example.com": "TIER_2",
  "signal-8.example.com": "TIER_3",
  "signal-9.example.com": "TIER_3",
  "signal-10.example.com": "TIER_3",
};

export default function BuyersIndexPage() {
  const { data, isLoading, isError } = useBuyersByClient(DEFAULT_CLIENT_ID);

  const [filters, setFilters] = useState<Filters>({
    tier: "ALL",
    role: "ALL",
    email: "ALL",
    jobChange: false,
  });

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading) {
    return (
      <div className="page-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <LoadingSpinner size="lg" label="Loading buying committees…" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-body">
        <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
          No buyer intel available. Run the Buyer Intel agent from an account detail page.
        </div>
      </div>
    );
  }

  // Flatten all contacts, annotating with domain
  const allContacts: Array<BuyerProfile & { domain: string }> = [];
  for (const [domain, contacts] of Object.entries(data.accounts)) {
    for (const c of contacts) {
      allContacts.push({ ...c, domain });
    }
  }

  // Apply filters
  const filtered = allContacts.filter((c) => {
    if (filters.tier !== "ALL") {
      const tier = DOMAIN_TIER[c.domain] ?? "TIER_3";
      if (tier !== filters.tier) return false;
    }
    if (filters.role !== "ALL" && c.committee_role !== filters.role) return false;
    if (filters.email !== "ALL" && c.email_status !== filters.email) return false;
    if (filters.jobChange && !c.job_change_signal) return false;
    return true;
  });

  const mismatches = filtered.filter((c) => c.title_mismatch_flag).length;
  const jobChanges = filtered.filter((c) => c.job_change_signal).length;

  return (
    <>
      <div className="page-head">
        <div style={{ fontWeight: 600, fontSize: 18 }}>Buying Committees</div>
        <div className="page-head-meta" style={{ marginLeft: 12 }}>
          All accounts · {data.meta.total_contacts_found} contacts across {data.meta.total_accounts_processed} accounts
        </div>
      </div>

      <div className="page-body">
        {/* Summary chips */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: `${data.meta.total_contacts_found} contacts`, color: "var(--text-1)" },
            { label: `${data.meta.mismatches_flagged} title mismatches`, color: mismatches > 0 ? "#b45309" : "var(--text-3)" },
            { label: `${jobChanges} job change signals`, color: jobChanges > 0 ? "#15803d" : "var(--text-3)" },
          ].map((chip) => (
            <span
              key={chip.label}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: chip.color,
                fontWeight: 500,
              }}
            >
              {chip.label}
            </span>
          ))}
        </div>

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 24,
            padding: "12px 16px",
            background: "var(--surface-2)",
            borderRadius: 10,
            border: "1px solid var(--border)",
            alignItems: "center",
          }}
        >
          <SelectFilter
            value={filters.tier}
            onChange={(v) => setFilter("tier", v)}
            options={["ALL", "TIER_1", "TIER_2", "TIER_3"]}
            labels={TIER_LABELS}
          />
          <SelectFilter
            value={filters.role}
            onChange={(v) => setFilter("role", v)}
            options={["ALL", "DECISION_MAKER", "CHAMPION", "BLOCKER", "INFLUENCER"]}
            labels={ROLE_LABELS}
          />
          <SelectFilter
            value={filters.email}
            onChange={(v) => setFilter("email", v)}
            options={["ALL", "VALID", "CATCH_ALL", "UNVERIFIED", "INVALID", "NOT_FOUND"]}
            labels={EMAIL_LABELS}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={filters.jobChange}
              onChange={(e) => setFilter("jobChange", e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Job change signal only
          </label>

          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>
            {filtered.length} of {allContacts.length} contacts
          </span>
        </div>

        {/* Results grouped by domain */}
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
            No contacts match the current filters.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {Object.entries(
              filtered.reduce<Record<string, typeof filtered>>((acc, c) => {
                (acc[c.domain] ||= []).push(c);
                return acc;
              }, {})
            ).map(([domain, contacts]) => (
              <div key={domain}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
                    {domain}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
                  </span>
                  <Link
                    to={`/accounts/acct-${domain.match(/(\d+)/)?.[1]?.padStart(3, "0")}`}
                    style={{ marginLeft: "auto", fontSize: 12, color: "var(--acc-600)" }}
                  >
                    View account →
                  </Link>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {contacts.map((c) => (
                    <BuyerCard key={c.contact_id} contact={c} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
