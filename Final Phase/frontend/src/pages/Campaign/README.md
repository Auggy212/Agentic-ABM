# Campaign Dashboard

Internal Operator console for Phase 5 outbound execution. Routed at
`/campaigns` inside `AppShell`.

## Components

- `CampaignDashboardPage.tsx` - page entry, summary tiles, latest run, send table, quotas, engagement feed, and halt state
- `RunCampaignButton.tsx` - queues `CampaignAgent.run` after backend gates pass
- `HaltModal.tsx` - operator-created client halt with a required detail and actor
- `HaltBanner.tsx` - active halt surface with typed `RESUME` confirmation
- `RunStatusCard.tsx` - latest run status and counters
- `SendsTable.tsx` - paginated send table with status filters
- `EngagementFeed.tsx` - latest webhook engagement events and handoff markers
- `hooks.ts` - React Query polling and mutations for campaign records
- `types.ts` - frontend mirrors for campaign run, send, halt, and engagement payloads

## API Endpoints

- `GET /api/campaign/runs?client_id={client_id}`
- `GET /api/campaign/sends?client_id={client_id}`
- `GET /api/campaign/engagement-feed?client_id={client_id}`
- `GET /api/campaign/halts`
- `GET /api/campaign/quota-status`
- `POST /api/campaign/run?client_id={client_id}`
- `POST /api/campaign/halt?client_id={client_id}`
- `POST /api/campaign/resume`

Campaign data polls every 30s with previous data retained so the operator
surface does not flicker between refreshes.

## Safety Rules

- A visible halt disables new campaign runs.
- A running latest campaign disables duplicate run launches.
- Resume requires typing `RESUME` exactly. Lowercase and whitespace variants stay disabled.
- CP3 gate failures from the backend are shown inline on `RunCampaignButton`.

## Tests

`__tests__/CampaignDashboardPage.test.tsx` covers:

- rendering seeded runs, sends, quota status, and engagement feed
- failed-send filtering
- successful run queueing
- CP3 lock error display
- halt and exact `RESUME` flow
