# ABM Engine — Agentic Account-Based Marketing Engine

A full-stack application for discovering, qualifying, and engaging target accounts through agentic workflows. Built with FastAPI (Python) backend and React (TypeScript) frontend.

**Current Release:** Phases 1–5 Complete + Signal Intelligence, AI Copilot & Visual generation (`Feature/Auggy` branch)

---

## 🎯 What is ABM Engine?

ABM Engine automates account-based marketing through orchestrated, multi-phase workflows:

1. **Discovery** — Use AI to find ideal customer profiles (ICPs) from multiple data sources
2. **Qualification** — Score and rank accounts across industry, size, tech stack, funding, and buying signals
3. **Signal Intelligence** — Capture buying signals (funding, hiring, news, competitor reviews) and classify buying stage
4. **Buyer Intelligence** — Enrich accounts with buyer personas, org charts, pain points
5. **Messaging** — Generate personalized narratives using LLMs (Claude / OpenAI / Groq)
6. **Campaign** — Execute multi-channel outbound via Instantly.ai, Phantombuster, Twilio, or email
7. **Feedback** — Collect client approval and engagement signals for continuous learning
8. **Handoff** — Classify responses and prepare qualified leads for sales teams
9. **Copilot & Visuals** — RAG-powered assistant and generated visual assets across the pipeline

---

## 📦 Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **Database**: SQLite by default (Postgres/Supabase supported via `DATABASE_URL`)
- **Auth**: Session/JWT with bcrypt password hashing (`itsdangerous`)
- **LLMs**: Anthropic Claude (primary), OpenAI, Groq, Perplexity (research)
- **Data APIs**: Apollo.io, Harmonic.ai, Crunchbase, BuiltWith, Reddit, Google News RSS, G2
- **Enrichment/Validation**: Hunter, NeverBounce, ZeroBounce, Clay
- **Outbound**: Instantly.ai, Phantombuster, Twilio
- **Testing**: pytest

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite 5
- **Styling**: Tailwind CSS
- **HTTP**: Axios
- **Mocking**: MSW (Mock Service Worker)
- **State**: React Context + hooks

---

## 🚀 Quick Start

### Prerequisites
- **Python** 3.10+
- **Node.js** 18+
- **Git**
- **Optional**: Docker (for Redis)

### 1. Clone & Setup Backend

```bash
# From repo root
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (see backend/README.md for API keys)
cp .env.example .env
# Edit .env with your API keys
```

### 2. Setup Frontend

```bash
# From repo root
cd frontend

# Install dependencies
npm install

# (Optional) Create .env.local with backend URL
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local
```

### 3. Run Both Applications

**Terminal 1 — Backend:**
```bash
cd backend
# Make sure .venv is activated
uvicorn backend.main:app --reload --port 8000
```
- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```
- UI: `http://localhost:5173` (or next available port)

### 4. (Optional) Start Redis
```bash
cd backend
docker-compose up -d
```

---

## 📋 Project Structure

```
abm-engine/
├── backend/                          # FastAPI application
│   ├── agents/                       # Phase-specific agents
│   │   ├── intake/                   # MasterContext validation
│   │   ├── icp_scout/                # Account discovery & scoring
│   │   ├── signal_intel/             # Buying-signal capture & stage classification
│   │   ├── buyer_intel/              # Buyer enrichment
│   │   ├── cp2/                      # Checkpoint 2 review gate
│   │   ├── storyteller/              # LLM narrative generation
│   │   ├── cp3/                      # Checkpoint 3 messaging gate
│   │   ├── campaign/                 # Multi-transport outbound execution
│   │   ├── cp4/                      # Checkpoint 4 review gate
│   │   ├── verifier/                 # Response verification & classification
│   │   ├── recent_activity/          # Activity tracking (PhantomBuster)
│   │   ├── copilot/                  # RAG-powered assistant (retriever + indexer)
│   │   └── visual/                   # Visual asset generation
│   ├── api/routes/                   # RESTful endpoints (auth, intake, accounts, signals, …)
│   ├── db/                           # SQLAlchemy models & session
│   ├── orchestration/crewai/         # CrewAI agent/task orchestration
│   ├── schemas/                      # JSON schema definitions
│   ├── scripts/                      # Data seeding
│   ├── services/                     # API clients (Groq, embedder, …)
│   ├── main.py                       # FastAPI entrypoint
│   ├── config_validator.py           # Startup env/key validation
│   ├── requirements.txt
│   ├── docker-compose.yml
│   ├── .env.example
│   └── README.md                     # Backend documentation
│
├── frontend/                         # React + Vite application
│   ├── src/
│   │   ├── pages/                    # Phase-specific pages
│   │   │   ├── Landing/  Dashboard/  Intake/  Accounts/
│   │   │   ├── Signals/  Buyers/  Storyteller/
│   │   │   ├── Checkpoint2/  Checkpoint3/  Checkpoint4/  Checkpoints/
│   │   │   ├── Campaign/  Sequences/  ClientReview/
│   │   │   ├── Verification/  SalesHandoff/  Visuals/
│   │   │   ├── Agents/  Integrations/  Pipeline/
│   │   ├── components/               # Reusable UI components
│   │   ├── hooks/  store/  types/    # Hooks, Zustand stores, shared types
│   │   ├── mocks/                    # MSW mock handlers
│   │   ├── App.tsx                   # Main router
│   │   └── main.tsx                  # React entrypoint
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md                     # Frontend documentation
│
├── API_KEYS.md                       # Full API-key reference & cost estimates
├── GIT_WORKFLOW.md                   # Git strategy & conventions
└── README.md                         # This file
```

---

## 🔄 User Flow (9 Phases)

### Phase 1: Intake
- User provides ICP criteria: industry, company size, budget, tech stack, geography
- System validates and stores in `MasterContext`
- Draft persistence to Redis (7-day TTL)

### Phase 2: ICP Scout
- Discover accounts from Apollo.io, Harmonic.ai, Crunchbase, BuiltWith
- Score across 6 dimensions: industry, size, tech, geography, funding, triggers
- User reviews, edits, ranks, or uploads existing CSV

### Phase 2.5: Signal Intelligence
- Capture buying signals: funding (Crunchbase), hiring (Apollo), news (Google News RSS), pain points (Reddit), competitor reviews (G2)
- Classify buying stage and synthesize intel reports (Perplexity deep research + Claude synthesis)

### Phase 3: Buyer Intelligence
- Enrich top accounts with buyer personas, org charts, pain points
- Research decision-making authority and procurement process

### Phase 4: Checkpoint 2 (Manual Review)
- Human approval of account list & buyer intelligence
- Gate enforcement before proceeding

### Phase 5: Checkpoint 3 (Messaging & Client Feedback)
- Storyteller generates multi-tier narratives (tier-1: personalized, tier-2/3: generic fallback)
- Operator reviews and approves messaging
- Client provides feedback; system refines templates

### Phase 6: Campaign Execution
- Campaign agent orchestrates outbound:
  - **Instantly.ai** — Email sequences
  - **Phantombuster** — LinkedIn automation
  - **Twilio** — SMS campaigns
  - **Mock** — Testing without spend
- Track: opens, clicks, replies, bounces
- Engagement scoring, reply classification, quota tracking

### Phase 7: Checkpoint 4 (Campaign Review)
- Human review of campaign metrics and engagement
- Approval for progression (e.g., sales handoff)

### Phase 8: Client Approval Portal
- Buyer reviews qualified accounts & approved messaging
- Provides feedback for continuous learning

### Phase 9: Verification & Handoff
- Response verification and classification
- Sales handoff notes
- CRM integration

---

## ✨ Latest Features (Feature/Auggy)

- ✅ **Signal Intelligence Agent** — Multi-source buying-signal capture & buying-stage classification
- ✅ **AI Copilot** — RAG-powered assistant (embedder + retriever + indexer) over pipeline context
- ✅ **Visual Agent** — Generated visual assets for accounts and messaging
- ✅ **Authentication** — Session/JWT auth with bcrypt hashing
- ✅ **CrewAI Orchestration** — Agents/tasks/crew wiring under `backend/orchestration/crewai`
- ✅ **Storyteller Agent** — Multi-tier LLM generation with template validation
- ✅ **Verifier Agent** — Response verification & classification with handoff notes
- ✅ **Campaign Agent** — Multi-transport outbound with quotas & circuit breakers
- ✅ **Client Review Portal** — Buyer approval flows & feedback aggregation
- ✅ **CP2/CP3/CP4 Gates** — Human review checkpoints with invariant enforcement
- ✅ **API Routes** — 22 routers incl. auth, signals, copilot, visual, dashboard, pipeline, sequences
- ✅ **Frontend** — 20 pages incl. dashboard, signals, storyteller, campaign, client review, sales handoff

---

## 📊 Feature Matrix

| Phase | Feature | Status | Backend | Frontend |
|-------|---------|--------|---------|----------|
| 1 | Intake | ✅ | MasterContext CRUD | Form + draft persistence |
| 2 | ICP Scout | ✅ | Multi-source discovery, scoring | Discovery UI, ranking |
| 2.5 | Signal Intel | ✅ | Signal capture, stage classification | Signals page |
| 3 | Buyer Intel | ✅ | Persona/org enrichment | Detail view |
| CP2 | Manual Review | ✅ | Approval workflow + invariants | Review & sign-off |
| CP3 | Messaging | ✅ | Storyteller, templates | Message cards, feedback panel |
| 5 | Campaign | ✅ | Multi-transport outbound | Campaign dashboard |
| CP4 | Campaign Review | ✅ | Approval workflow | Metrics + approval |
| Client | Approval Portal | ✅ | Buyer flows | Feedback form |
| Verify | Response Verification | ✅ | Verifier agent | Handoff notes |
| — | Copilot | ✅ | RAG retriever + indexer | In-app assistant |
| — | Visuals | ✅ | Visual generation agent | Visuals page |
| — | Auth | ✅ | Session/JWT + bcrypt | Login flow |

---

## 📚 Documentation

- **[API_KEYS.md](./API_KEYS.md)** — Full API-key reference, free/paid tiers, budget caps, and per-run cost estimates
- **[backend/README.md](./backend/README.md)** — Backend API, sources, scoring, environment variables, testing
- **[frontend/README.md](./frontend/README.md)** — Frontend setup, pages, components, types, development tips
- **[backend/docs/](./backend/docs/)** — Phase-specific dry-run scripts, handoff guides, setup instructions
  - `TOOL_SETUP.md`, `GROQ_SETUP.md`
  - `cp2_dry_run_script.md`, `cp2_review_checklist.md`, `cp3_dry_run_script.md`
  - `phase2_to_phase3_handoff.md`, `phase3_to_phase4_handoff.md`, `phase4_to_phase5_handoff.md`, `phase5_phantombuster_handoff.md`
- **[GIT_WORKFLOW.md](./GIT_WORKFLOW.md)** — Branch strategy, commit conventions, PR process

---

## 🔧 Common Tasks

### Run Backend Tests
```bash
cd backend
pytest backend/tests/ -v
```

### Seed Test Data
```bash
cd backend
python backend/scripts/seed_phase3_data.py
python backend/scripts/seed_templates.py
```

### Build Frontend for Production
```bash
cd frontend
npm run build
```

### Enable Real LLM (Default: Mock)
Edit `backend/.env`:
```bash
STORYTELLER_USE_MOCK=0  # Use real Claude/GPT-4o-mini
```

### Check API Docs
Visit `http://localhost:8000/docs` (Swagger UI)

---

## 🌐 Environment Variables

> See **[API_KEYS.md](./API_KEYS.md)** for the complete key reference, free/paid tiers, and budget caps. The table below is a quick summary.

### Backend (`backend/.env`)
| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Recommended | Primary LLM for all agents |
| `APOLLO_API_KEY` | Recommended | ICP Scout / Signal Intel source |
| `SECRET_KEY` | Recommended | JWT/session signing secret (any strong random string) |
| `OPENAI_API_KEY` | No | Tier 2/3 Storyteller generation |
| `GROQ_API_KEY` | No | Fast/cheap LLM fallback |
| `PERPLEXITY_API_KEY` | No | Signal Intel deep research |
| `HARMONIC_API_KEY` | No | Funded startup discovery |
| `CRUNCHBASE_API_KEY` | No | Company funding data |
| `BUILTWITH_API_KEY` | No | Tech stack detection |
| `INSTANTLY_API_KEY` | No | Outbound email (Phase 5) |
| `HUNTER_API_KEY` / `NEVERBOUNCE_API_KEY` | No | Email discovery & validation |
| `DATABASE_URL` | No | Postgres/Supabase (defaults to SQLite) |
| `REDIS_URL` | No | Caching/queues (optional) |
| `TEMPLATE_ADMIN_TOKEN` | No | Prompt template writes |
| `ANTHROPIC_RUN_BUDGET_USD` / `OPENAI_RUN_BUDGET_USD` | No | Per-run LLM spend caps (default 50 / 20) |

### Frontend (`frontend/.env.local`)
| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API endpoint |

---

## 🤝 Contributing

1. Check [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) for branch conventions
2. Create a feature branch: `git checkout -b feature/YourFeature`
3. Commit with clear messages: `git commit -m "feat: Add feature description"`
4. Push to origin: `git push origin feature/YourFeature`
5. Open a pull request with description & testing notes

---

## 📞 Support & Resources

- **API Docs**: `http://localhost:8000/docs` (Swagger)
- **Issue Tracking**: GitHub Issues
- **Discussion**: GitHub Discussions
- **Dry-run Scripts**: See `backend/docs/`

---

## 📄 License

[Add license info if applicable]

---

**Last Updated**: July 6, 2026  
**Current Branch**: `Feature/Auggy` (Phases 1–5 + Signal Intel, Copilot & Visuals)  
**Python**: 3.10+  
**Node.js**: 18+
