# abm-engine

`abm-engine` is an Agentic Account-Based Marketing Engine — a monorepo containing a FastAPI Python backend and a React+Vite+TypeScript frontend. The system orchestrates multi-phase, agentic workflows to discover, qualify, and engage target accounts.

Both applications live in the same repository and follow the same branch strategy documented in [GIT_WORKFLOW.md](./GIT_WORKFLOW.md).

## Project Structure

```text
abm-engine/
├── backend/                       # FastAPI Python application
│   ├── agents/                    # Phase-specific agent implementations
│   │   ├── intake/                # Lead intake & MasterContext validation
│   │   ├── icp_scout/             # ICP discovery from multiple sources
│   │   ├── buyer_intel/           # Buyer intelligence gathering
│   │   ├── cp2/                   # Checkpoint 2 review & approval
│   │   ├── cp3/                   # Checkpoint 3 messaging & client feedback
│   │   ├── storyteller/           # Narrative generation (Claude/GPT-4o-mini)
│   │   ├── campaign/              # Outbound campaign execution & tracking
│   │   ├── cp4/                   # Checkpoint 4 campaign review
│   │   ├── verifier/              # Response verification & classification
│   │   └── recent_activity/       # Activity aggregation
│   ├── api/routes/                # RESTful endpoints
│   ├── db/                        # SQLite models & session management
│   ├── schemas/                   # JSON schema definitions
│   ├── scripts/                   # Data seeding scripts
│   ├── services/                  # API clients (Groq, OpenAI, etc.)
│   ├── main.py                    # FastAPI app entry point
│   └── docker-compose.yml         # Local Redis for draft persistence
├── frontend/                      # React+Vite+TypeScript application
│   ├── src/
│   │   ├── pages/                 # Page components by phase
│   │   │   ├── Intake/            # Client intake form
│   │   │   ├── ICP/               # ICP account discovery
│   │   │   ├── Checkpoint2/       # Manual review & approval
│   │   │   ├── Checkpoint3/       # Messaging & client feedback
│   │   │   ├── ClientReview/      # Client approval portal
│   │   │   ├── Campaign/          # Campaign execution dashboard
│   │   │   └── Pipeline/          # Account pipeline view
│   │   ├── components/            # Reusable UI components
│   │   ├── mocks/                 # MSW mock handlers for offline dev
│   │   └── App.tsx                # Main app router
│   ├── package.json
│   └── vite.config.ts
├── GIT_WORKFLOW.md
└── README.md
```

## Latest Updates (Feature/Auggy)

Phase 3–5 features now complete:

- **CP3 Agent & UI** — Message review, client feedback collection, phase gate enforcement
- **Storyteller Agent** — Multi-tier narrative generation (Claude → GPT-4o-mini fallback), template-based validation
- **Verifier Agent** — Mock response classification & handoff note generation
- **Campaign Agent** — Multi-transport outbound (Instantly.ai, Phantombuster, Twilio, mock), quota tracking, circuit breakers
- **Client Review Portal** — Buyer approval flows, client feedback aggregation
- **CP4 Agent** — Campaign review & approval checkpoints
- **API Routes** — `/api/cp3`, `/api/cp4`, `/api/campaign`, `/api/client_review`, `/api/storyteller`, `/api/templates`, `/api/webhooks`
- **Test Suite** — Phase 3/4/5 schemas, campaign agent, CP4 state manager, e2e workflows

## How to Run Locally

### Prerequisites

- Python 3.10+
- Node.js 18+
- Redis (for draft persistence; optional with Docker Compose)

### Backend Setup

1. **Create and activate a Python virtual environment:**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Fill in API keys (see backend/README.md for details)
   ```

4. **(Optional) Start Redis:**
   ```bash
   docker-compose up -d
   ```

5. **Run the backend server:**
   ```bash
   cd ..  # Back to repo root
   uvicorn backend.main:app --reload --port 8000
   ```
   API available at `http://localhost:8000`  
   Swagger docs at `http://localhost:8000/docs`

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Run the dev server:**
   ```bash
   npm run dev
   ```
   UI available at `http://localhost:5173` (or next available port)

### Run Tests

```bash
cd backend
pytest backend/tests/ -v
```

## User Flow

### 1. **Intake Phase**
   - User creates a `MasterContext` with ICP criteria (industry, company size, budget, tech stack, etc.)
   - System validates and stores context in SQLite

### 2. **ICP Scout Phase**
   - Agentic discovery from Apollo.io, Harmonic.ai, Crunchbase, BuiltWith (quota-tracked)
   - Accounts scored across 6 weighted dimensions (industry, size, tech, geography, funding, triggers)
   - User reviews, edits, and ranks accounts; optionally uploads existing account CSV

### 3. **Buyer Intelligence Phase**
   - System enriches top-ranked accounts with buyer personas, org charts, pain points

### 4. **Checkpoint 2 (Manual Review)**
   - Human review & approval of account list and buyer intelligence
   - Gate enforcement before proceeding to outbound

### 5. **Checkpoint 3 (Messaging & Client Feedback)**
   - Storyteller agent generates multi-tier narratives (personalized, generic fallback)
   - Operator reviews and approves outbound messaging
   - Client provides feedback; system learns and adjusts templates

### 6. **Campaign Execution Phase**
   - Campaign agent orchestrates outbound across Instantly.ai, Phantombuster, Twilio
   - Engagement scoring, reply classification, quota management, circuit breakers
   - Real-time tracking of sends, opens, replies

### 7. **Checkpoint 4 (Campaign Review)**
   - Human review of campaign performance and engagement metrics
   - Approval for phase progression (e.g., handoff to sales)

### 8. **Client Approval Portal**
   - Buyer views qualified accounts and approved messaging
   - Provides feedback; system refines future narratives

### 9. **Verification & Handoff**
   - Response verification and sales handoff note generation
   - Integration with CRM and sales tools

## Phase Features

| Phase | Feature | Status |
|-------|---------|--------|
| Intake | MasterContext validation, draft persistence | ✅ |
| ICP Scout | Multi-source discovery, quota tracking, scoring | ✅ |
| Buyer Intel | Persona enrichment, org chart extraction | ✅ |
| CP2 | Account list review, buyer intel approval | ✅ |
| CP3 | Message generation, client feedback, phase gates | ✅ |
| Campaign | Multi-transport outbound, quota tracking, circuit breakers | ✅ |
| CP4 | Campaign review & approval | ✅ |
| Client Review | Buyer portal, feedback aggregation | ✅ |
| Verifier | Response classification, handoff notes | ✅ |

## Environment Files

- `backend/.env.example` — API keys, LLM budgets, infrastructure
- `frontend/.env.example` — Frontend configuration

Copy each example file to `.env` locally:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env  # If needed
```

## Documentation

- [backend/README.md](./backend/README.md) — Backend API, sources, scoring, seeding
- [backend/docs/](./backend/docs/) — Phase-specific dry-run scripts and handoff guides
- [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) — Git strategy and branch conventions
