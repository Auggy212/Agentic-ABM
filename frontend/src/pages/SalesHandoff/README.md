# Sales Handoff (CP4 — external Sales Exec view)

Mobile-first, token-gated public page that lets a Sales Exec accept or decline a
warmed lead pushed from the Phase 5 campaign engine. Routed at
`/sales/handoff/:token`. The URL token IS the auth — no login required.

## Audience discipline

External surface (master prompt §1). Strip everything internal:

- No `client_id`, run ids, validation badges, costs, model names
- No internal status words ("ESCALATED" surfaces as "no longer active")
- No nav, no copilot, no agent rail (lives outside `AppShell`)
- The `[CP4 Handoff]` header line in `tldr_text` is filtered out client-side

## Key components

- `SalesHandoffPage.tsx` — page entry; resolves token, picks terminal vs. action view
- `AcceptModal.tsx` / `DeclineModal.tsx` — bottom-sheet modals; ≥44px tap targets
- `AcceptedView.tsx` — terminal success surface with optional meeting link
- `ExpiredView.tsx` — 404 / REJECTED / ESCALATED catch-all

## Primary states

| State | Trigger | Surface |
|---|---|---|
| Loading | `useQuery` pending | spinner |
| PENDING (fresh) | server returns PENDING, ≥6h remaining | green SLA badge |
| PENDING (warn) | <6h remaining | amber SLA badge |
| PENDING (critical) | <1h remaining | red SLA badge |
| Overdue | now > notify_sent_at + sla_hours | red "Overdue" badge |
| ACCEPTED | server returns ACCEPTED | success view |
| REJECTED / ESCALATED / 404 | terminal or unknown token | ExpiredView |

## API endpoints consumed

- `GET  /api/sales/handoff/:token`
- `POST /api/sales/handoff/:token/accept`  body `{ accepted_by }`
- `POST /api/sales/handoff/:token/reject`  body `{ rejection_reason }`

## Mock fixtures

`src/mocks/salesHandoff.ts` exports tokens for each state:

- `MOCK_PENDING_TOKEN` — fresh, 22h remaining
- `MOCK_OVERDUE_TOKEN` — 0h remaining, still PENDING
- `MOCK_ACCEPTED_TOKEN`, `MOCK_REJECTED_TOKEN`, `MOCK_ESCALATED_TOKEN`

To preview during dev: visit `/sales/handoff/tok_pending_fresh`.

## Backend gap (option 1, master prompt §2)

Today the backend exposes `/api/checkpoint-4/{handoff_id}` (Operator-authenticated
internally). Phase 5b backend follow-up:

1. Add `share_token` column to `SalesHandoffRecord` (uuid, unique)
2. Add unauthenticated `GET /api/sales/handoff/{share_token}` returning the
   sanitized public payload (no `client_id`, `triggering_events` already public)
3. Add `POST /api/sales/handoff/{share_token}/{accept|reject}` mirroring the
   existing CP4 state-manager calls

Until then this page is mock-first.

## Gotchas

- The clipboard copy can fail silently on insecure (non-HTTPS) contexts — that's
  expected; we don't surface an error
- Test the page at iPhone SE width (375px); the bottom action bar must remain
  reachable with the on-screen keyboard open
- `useSlaCountdown` re-renders every 60s — granular enough for "23h" → "22h"
  ticks without hammering React
