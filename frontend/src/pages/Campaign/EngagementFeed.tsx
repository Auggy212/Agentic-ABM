import type { EngagementFeedItem } from "./types";

interface Props {
  events: EngagementFeedItem[];
}

const EVENT_LABEL: Record<string, string> = {
  EMAIL_REPLY: "Email reply",
  EMAIL_OPEN: "Email open",
  EMAIL_BOUNCE: "Email bounce",
  EMAIL_UNSUBSCRIBE: "Email unsubscribe",
  LINKEDIN_DM_REPLY: "LinkedIn DM reply",
  LINKEDIN_CONNECTION_ACCEPTED: "LinkedIn connection accepted",
  WHATSAPP_REPLY: "WhatsApp reply",
  MEETING_BOOKED: "Meeting booked",
  REPLY_NEGATIVE: "Negative reply",
};

function eventTone(eventType: string): string {
  if (eventType === "EMAIL_BOUNCE" || eventType === "EMAIL_UNSUBSCRIBE" || eventType === "REPLY_NEGATIVE") {
    return "border-red-100 bg-red-50";
  }
  if (eventType === "MEETING_BOOKED" || eventType.endsWith("_REPLY")) {
    return "border-emerald-100 bg-emerald-50";
  }
  return "border-slate-100 bg-slate-50";
}

export default function EngagementFeed({ events }: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Engagement feed</h3>
        <span className="text-[11px] uppercase tracking-wide text-slate-400">latest events</span>
      </header>
      {events.length === 0 ? (
        <div className="text-sm text-slate-500">No engagement events recorded yet.</div>
      ) : (
        <ul className="grid gap-2">
          {events.slice(0, 8).map((event) => (
            <li
              key={event.event_id}
              className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 ${eventTone(event.event_type)}`}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  {EVENT_LABEL[event.event_type] ?? event.event_type}
                  {event.triggered_handoff ? (
                    <span data-testid="feed-handoff-pill" className="ml-2 inline-flex items-center rounded-full border border-emerald-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                      handoff
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {event.account_domain}
                  {typeof event.score_delta === "number" && event.score_delta > 0 ? ` +${event.score_delta}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                {new Date(event.occurred_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
