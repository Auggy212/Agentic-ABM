# Checkpoint 4 — Sales Handoff Queue (internal Operator)

Dense desktop console at `/checkpoint-4` for monitoring the warmed-lead queue
that the Phase 5 Campaign agent feeds into. Operators can see SLA pressure,
notify the Sales Exec, accept/reject on their behalf, and bulk-escalate
overdue handoffs.

## Audience

Internal Operator only (master prompt §1). Lives inside `AppShell`. Renders
every internal field — handoff_id, escalation_reason, full audit timestamps.
Never link to this from an external surface.

## Key components

- `CP4QueuePage.tsx` — page entry. Summary tiles + filter chips + table + drawer
- `HandoffRow.tsx` — single table row (account, contact, score, status chip, SLA badge, created)
- `SLABadge.tsx` — green / amber / red urgency badge driven by `useSlaCountdown` (60s tick)
- `HandoffDetailDrawer.tsx` — right-hand drawer with TL;DR, triggering events, full audit, notify/accept/reject actions
- `EscalateSweepButton.tsx` — destructive sweep action; uses `TypedConfirmationModal` with `"ESCALATE"`

## Primary states

| State | Source | Surface |
|---|---|---|
| Loading | `useCP4Queue` pending | "Loading handoffs…" placeholder |
| Empty | summary.total === 0 | "No handoffs yet" empty state |
| Populated | summary.total > 0 | Tiles + table + drawer on row click |
| Hard error | network / 500 | red "Could not load CP4 queue. Retry shortly." |
| Filter empty | filtered === 0 | "No handoffs in {STATUS} state." |

## API endpoints consumed

- `GET  /api/checkpoint-4?client_id={...}` (polled every 30s)
- `GET  /api/checkpoint-4/{handoff_id}`
- `POST /api/checkpoint-4/{handoff_id}/notify`
- `POST /api/checkpoint-4/{handoff_id}/accept`  body `{ accepted_by }`
- `POST /api/checkpoint-4/{handoff_id}/reject`  body `{ rejection_reason, rejected_by }`
- `POST /api/checkpoint-4/escalate-overdue?client_id={...}`

## Mock fixtures

`src/mocks/cp4.ts` seeds 7 handoffs spanning every state:

- `h-pending-fresh` — 22h SLA remaining (green badge)
- `h-pending-warn` — 5h remaining (amber)
- `h-pending-overdue` — past deadline, still PENDING (red "Overdue")
- `h-pending-unnotified` — no `notify_sent_at` yet (gray "Awaiting notify")
- `h-accepted`, `h-rejected`, `h-escalated`

Mutations on the mocks persist for the session and are reset between tests via
`resetMockCP4()` in `src/test/setup.ts`.

## TypedConfirmationModal usage

The escalate-overdue sweep is an irreversible bulk action — every overdue
PENDING row flips to ESCALATED in one shot. Per master prompt §7 we route
through `TypedConfirmationModal` with `confirmationText="ESCALATE"`. The button
is disabled until the operator types `ESCALATE` (case-sensitive — `escalate` is
rejected). The friction is the safety mechanism; do not soften it.

## Polling

`useCP4Queue` polls every 30s with `placeholderData: prev` so tile counts and
the row table don't flicker (master prompt §5). The `useSlaCountdown` hook
ticks the SLA badges every 60s independently — the labels go from `23h left`
→ `22h left` without a network round-trip.

## Audit trail

Every accept/reject/escalate emits a backend audit log entry via the existing
`cp4_audit_log` table (Phase 5 Deliverable A). The drawer renders the audit
fields (created/notified/accepted/rejected/escalated timestamps + reasons) but
does NOT yet render the audit-log entries themselves — backlog item if more
detail is requested.

## Gotchas

- `notify` must be called before `accept`/`reject`; the drawer disables the
  buttons with a tooltip explaining why
- Filter state is local (`useState`), not URL-synced — by design; if you want
  filters to survive page reloads, lift to `useSearchParams`
- Keep the drawer narrow on small displays — it's `max-w-md` and overlays the
  table on widths < 1024px (no responsive split layout planned)
