import Btn from "@/components/ui/Btn";
import { useDiscoverBuyers } from "./hooks";

const DEFAULT_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

interface BuyersEmptyProps {
  domain: string;
}

export default function BuyersEmpty({ domain }: BuyersEmptyProps) {
  const discover = useDiscoverBuyers();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 24px",
        textAlign: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
        }}
      >
        👥
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          No buying committee found yet
        </div>
        <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 360 }}>
          Buyer Intel hasn't run for{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>{domain}</span>. Run the
          agent to discover the buying committee and enrich contacts.
        </div>
      </div>

      {discover.isSuccess && (
        <div
          style={{
            padding: "10px 16px",
            background: "var(--ok-50, #f0fdf4)",
            border: "1px solid var(--ok-200, #bbf7d0)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--ok-700, #15803d)",
          }}
        >
          Queued — job ID <span style={{ fontFamily: "var(--font-mono)" }}>{discover.data?.job_id}</span>. This
          may take a minute.
        </div>
      )}

      {discover.isError && (
        <div
          style={{
            padding: "10px 16px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            fontSize: 13,
            color: "#b91c1c",
          }}
        >
          Failed to queue — check the backend logs.
        </div>
      )}

      <Btn
        variant="accent"
        size="sm"
        icon="users"
        loading={discover.isPending}
        onClick={() => discover.mutate(DEFAULT_CLIENT_ID)}
      >
        Run Buyer Intel →
      </Btn>
    </div>
  );
}
