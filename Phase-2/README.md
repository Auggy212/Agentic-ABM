# abm-engine

`abm-engine` is a monorepo with a shared Git repository for two applications:

- `frontend/` - React + Tailwind CSS frontend placeholder
- `backend/` - Node.js/Express backend placeholder

Both folders live in the same repository and follow the same branch strategy documented in [GIT_WORKFLOW.md](./GIT_WORKFLOW.md).

## Project Structure

```text
abm-engine/
├── backend/
├── frontend/
├── .gitignore
├── GIT_WORKFLOW.md
└── README.md
```

## Frontend

Location: [frontend](./frontend)

Current status: placeholder HTML page plus environment template for a future React + Tailwind CSS app.

How to run right now:

1. Open [frontend/index.html](./frontend/index.html) in a browser for the placeholder page.

Planned local dev flow after React/Vite setup is added:

```bash
cd frontend
npm install
npm run dev
```

## Backend

Location: [backend](./backend)

Current status: placeholder `server.ts` entrypoint plus environment template for a future Node.js/Express service.

How to run right now:

1. Review [backend/server.ts](./backend/server.ts) as the backend entrypoint placeholder.

Planned local dev flow after the Express app and package scripts are added:

```bash
cd backend
npm install
npm run dev
```

## Environment Files

- `frontend/.env.example` includes `VITE_API_BASE_URL`
- `backend/.env.example` includes service keys and infrastructure placeholders

Copy each example file to a local `.env` when wiring the real apps.
