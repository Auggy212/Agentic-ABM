import Btn from "@/components/ui/Btn";
import { getActiveClientId } from "@/lib/session";
import { useDiscoverBuyers } from "./hooks";

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
            background: "rgba(0,255,150,0.07)",
            border: "1px solid rgba(0,255,150,0.22)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--good-500)",
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
            background: "rgba(255,70,70,0.08)",
            border: "1px solid rgba(255,70,70,0.25)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--bad-500)",
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
        onClick={() => discover.mutate(getActiveClientId())}
      >
        Run Buyer Intel →
      </Btn>
    </div>
  );
}
