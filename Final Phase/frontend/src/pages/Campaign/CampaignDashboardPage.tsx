import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import QuotaPanel from "@/components/QuotaPanel";
import Btn from "@/components/ui/Btn";
import EngagementFeed from "./EngagementFeed";
import HaltBanner from "./HaltBanner";
import HaltModal from "./HaltModal";
import RunCampaignButton from "./RunCampaignButton";
import RunStatusCard from "./RunStatusCard";
import SendsTable from "./SendsTable";
import { getApiErrorMessage } from "./helpers";
import {
  useActiveHalts,
  useCampaignRuns,
  useEngagementFeed,
  useOutboundSends,
} from "./hooks";
import { DEFAULT_CAMPAIGN_CLIENT_ID } from "./types";

export default function CampaignDashboardPage() {
  const [search] = useSearchParams();
  const clientId = search.get("client_id") || DEFAULT_CAMPAIGN_CLIENT_ID;
  const [haltOpen, setHaltOpen] = useState(false);

  const runsQuery = useCampaignRuns(clientId);
  const sendsQuery = useOutboundSends(clientId);
  const feedQuery = useEngagementFeed(clientId);
  const haltsQuery = useActiveHalts(clientId);

  const runs = runsQuery.data?.runs ?? [];
  const sends = sendsQuery.data?.sends ?? [];
  const events = feedQuery.data?.events ?? [];
  const activeHalt = haltsQuery.data?.halts.find((halt) => halt.is_active) ?? null;
  const latestRun = runs[0] ?? null;
  const hasRunningRun = latestRun?.status === "RUNNING";

  const summary = useMemo(() => {
    const replies = events.filter((event) => event.event_type.endsWith("_REPLY") || event.event_type === "MEETING_BOOKED").length;
    return {
      totalRuns: runs.length,
      sent: sends.filter((send) => send.status === "SENT").length,
      failed: sends.filter((send) => send.status === "FAILED").length,
      replies,
    };
  }, [events, runs.length, sends]);

  const loadError = runsQuery.error || sendsQuery.error || feedQuery.error || haltsQuery.error;
  const loading = runsQuery.isLoading || sendsQuery.isLoading || feedQuery.isLoading || haltsQuery.isLoading;
  const runDisabledReason = activeHalt
    ? "Resume the active halt before launching a new run."
    : hasRunningRun
      ? "A campaign run is already in progress."
      : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <div className="page-head-meta">Phase 5 outbound execution - client {clientId.slice(0, 8)}</div>
        </div>
        <div className="page-head-actions">
          <Btn
            type="button"
            variant="danger-ghost"
            icon="ban"
            onClick={() => setHaltOpen(true)}
            disabled={Boolean(activeHalt)}
            title={activeHalt ? "Campaign is already halted." : "Halt campaign sends"}
          >
            Halt
          </Btn>
          <RunCampaignButton clientId={clientId} disabled={Boolean(runDisabledReason)} disabledReason={runDisabledReason} />
        </div>
      </div>

      <div className="page-body grid gap-4">
        {activeHalt ? <HaltBanner clientId={clientId} halt={activeHalt} /> : null}

        {loadError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {getApiErrorMessage(loadError, "Could not load the campaign dashboard.")}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Loading campaign dashboard...
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile label="Runs" value={summary.totalRuns} tone="default" />
          <SummaryTile label="Sent" value={summary.sent} tone="emerald" />
          <SummaryTile label="Failed" value={summary.failed} tone={summary.failed > 0 ? "red" : "default"} />
          <SummaryTile label="Replies" value={summary.replies} tone={summary.replies > 0 ? "blue" : "default"} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="grid gap-4">
            {latestRun ? (
              <RunStatusCard run={latestRun} />
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                No campaign runs have been recorded for this client yet.
              </div>
            )}
            <SendsTable sends={sends} />
          </div>

          <aside className="grid content-start gap-4">
            <QuotaPanel />
            <EngagementFeed events={events} />
          </aside>
        </section>
      </div>

      <HaltModal clientId={clientId} open={haltOpen} onClose={() => setHaltOpen(false)} />
    </>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "default" | "emerald" | "red" | "blue" }) {
  const color =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "blue"
          ? "text-blue-700"
          : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div data-testid={`campaign-summary-${label.toLowerCase()}`} className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
