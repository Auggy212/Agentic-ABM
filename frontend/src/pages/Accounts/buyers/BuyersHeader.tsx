import Btn from "@/components/ui/Btn";
import type { BuyerProfile, QuotaStatus } from "./types";
import { useDiscoverBuyers } from "./hooks";

const DEFAULT_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

interface BuyersHeaderProps {
  contacts: BuyerProfile[];
  quota: QuotaStatus | undefined;
  domain: string;
}

function QuotaBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(1, used / limit);
  const warn = pct >= 0.8;
  const color = warn ? "#f59e0b" : "var(--acc-500, #6366f1)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: "var(--text-3)", width: 90, flexShrink: 0 }}>{label}</span>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: "var(--surface-2)",
          minWidth: 60,
          maxWidth: 120,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            borderRadius: 2,
            background: color,
            transition: "width 0.3s",
          }}
        />
      </div>
      <span style={{ color: warn ? "#b45309" : "var(--text-2)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
        {used}/{limit}
      </span>
    </div>
  );
}

export default function BuyersHeader({ contacts, quota, domain }: BuyersHeaderProps) {
  const discover = useDiscoverBuyers();

  const valid = contacts.filter((c) => c.email_status === "VALID").length;
  const catchAll = contacts.filter((c) => c.email_status === "CATCH_ALL").length;
  const unverified = contacts.filter((c) =>
    c.email_status === "UNVERIFIED" || c.email_status === "INVALID" || c.email_status === "NOT_FOUND"
  ).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 24,
        padding: "16px 20px",
        background: "var(--surface-2)",
        borderRadius: 10,
        border: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
    >
      {/* Left: contact stats */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Contacts found
          </div>
          <div style={{ fontSize: 24, fontFamily: "var(--font-display)", fontWeight: 400 }}>
            {contacts.length}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Email verification
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
            <span>
              <span style={{ color: "#16a34a", fontWeight: 600 }}>{valid}</span>
              <span style={{ color: "var(--text-3)", marginLeft: 3 }}>valid</span>
            </span>
            <span>
              <span style={{ color: "#d97706", fontWeight: 600 }}>{catchAll}</span>
              <span style={{ color: "var(--text-3)", marginLeft: 3 }}>catch-all</span>
            </span>
            <span>
              <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{unverified}</span>
              <span style={{ color: "var(--text-3)", marginLeft: 3 }}>unverified</span>
            </span>
          </div>
        </div>

        {quota ? (
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Monthly quota
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <QuotaBar label="Apollo" used={quota.APOLLO_CONTACTS.used} limit={quota.APOLLO_CONTACTS.limit} />
              <QuotaBar label="Hunter" used={quota.HUNTER.used} limit={quota.HUNTER.limit} />
              <QuotaBar label="Lusha" used={quota.LUSHA.used} limit={quota.LUSHA.limit} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-3)", alignSelf: "flex-end" }}>
            Quota data unavailable
          </div>
        )}
      </div>

      {/* Right: re-run button */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        <Btn
          variant="ghost"
          size="sm"
          icon="users"
          loading={discover.isPending}
          onClick={() => discover.mutate(DEFAULT_CLIENT_ID)}
        >
          Re-run Buyer Intel
        </Btn>
        {discover.isSuccess && (
          <div style={{ fontSize: 11, color: "var(--ok-700, #15803d)" }}>
            Queued · job {discover.data?.job_id?.slice(0, 8)}…
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          {domain}
        </div>
      </div>
    </div>
  );
}
