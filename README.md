# ABM Engine — Agentic Account-Based Marketing Engine

A full-stack application for discovering, qualifying, and engaging target accounts through agentic workflows. Built with FastAPI (Python) backend and React (TypeScript) frontend.

**Current Release:** Phase 3–5 Complete (`feature/Auggy` branch)

---

## 🎯 What is ABM Engine?

ABM Engine automates account-based marketing through orchestrated, multi-phase workflows:

1. **Discovery** — Use AI to find ideal customer profiles (ICPs) from multiple data sources
2. **Qualification** — Score and rank accounts across industry, size, tech stack, funding, and buying signals
3. **Intelligence** — Enrich accounts with buyer personas, org charts, pain points
4. **Messaging** — Generate personalized narratives using LLMs (Claude/GPT-4o-mini)
5. **Campaign** — Execute multi-channel outbound via Instantly.ai, Phantombuster, Twilio, or email
6. **Feedback** — Collect client approval and engagement signals for continuous learning
7. **Handoff** — Classify responses and prepare qualified leads for sales teams

---

## 📦 Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **Database**: SQLite (with Postgres support)
- **Cache**: Redis (draft persistence)
- **LLMs**: Anthropic Claude, OpenAI GPT-4o-mini
- **APIs**: Apollo.io, Harmonic.ai, Crunchbase, BuiltWith
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
│   │   ├── icp_scout/                # Account discovery
│   │   ├── buyer_intel/              # Buyer enrichment
│   │   ├── cp2/                      # Checkpoint 2 review
│   │   ├── cp3/                      # Checkpoint 3 messaging
│   │   ├── storyteller/              # LLM narrative generation
│   │   ├── campaign/                 # Outbound execution
│   │   ├── cp4/                      # Checkpoint 4 review
│   │   ├── verifier/                 # Response classification
│   │   └── recent_activity/          # Activity tracking
│   ├── api/routes/                   # RESTful endpoints
│   ├── db/                           # SQLite models
│   ├── schemas/                      # JSON schema definitions
│   ├── scripts/                      # Data seeding
│   ├── services/                     # API clients
│   ├── main.py                       # FastAPI entrypoint
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md                     # Backend documentation
│
├── frontend/                         # React+Vite application
│   ├── src/
│   │   ├── pages/                    # Phase-specific pages
│   │   │   ├── Intake/
│   │   │   ├── ICP/
│   │   │   ├── Checkpoint2/
│   │   │   ├── Checkpoint3/
│   │   │   ├── ClientReview/
│   │   │   ├── Campaign/
│   │   │   ├── StorytellerPage/
│   │   │   └── Pipeline/
│   │   ├── components/               # Reusable UI components
│   │   ├── mocks/                    # MSW mock handlers
│   │   ├── App.tsx                   # Main router
│   │   └── main.tsx                  # React entrypoint
│   ├── package.json
│   ├── vite.config.ts
│   ├── .env.example
│   └── README.md                     # Frontend documentation
│
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

- ✅ **CP3 Agent** — Message review, operator approval, client feedback
- ✅ **Storyteller Agent** — Multi-tier LLM generation with template validation
- ✅ **Verifier Agent** — Response classification & handoff notes
- ✅ **Campaign Agent** — Multi-transport outbound with quotas & circuit breakers
- ✅ **Client Review Portal** — Buyer approval flows & feedback aggregation
- ✅ **CP4 Agent** — Campaign performance review & approval
- ✅ **API Routes** — 11 new endpoints for CP3, CP4, Campaign, Client Review, Storyteller, Templates, Webhooks
- ✅ **Test Suite** — Comprehensive tests for Phase 3/4/5 schemas and agents
- ✅ **Frontend Pages** — CP3 operator UI, client review portal, campaign dashboard, storyteller templates

---

## 📊 Feature Matrix

| Phase | Feature | Status | Backend | Frontend |
|-------|---------|--------|---------|----------|
| 1 | Intake | ✅ | MasterContext CRUD | Form + draft persistence |
| 2 | ICP Scout | ✅ | Multi-source discovery, scoring | Discovery UI, ranking |
| 3 | Buyer Intel | ✅ | Persona/org enrichment | Detail view |
| CP2 | Manual Review | ✅ | Approval workflow | Review & sign-off |
| CP3 | Messaging | ✅ | Storyteller, templates | Message cards, feedback panel |
| 5 | Campaign | ✅ | Multi-transport outbound | Campaign dashboard |
| CP4 | Campaign Review | ✅ | Approval workflow | Metrics + approval |
| Client | Approval Portal | ✅ | Buyer flows | Feedback form |
| Verify | Response Classification | ✅ | Verifier agent | Handoff notes |

---

## 📚 Documentation

- **[backend/README.md](./backend/README.md)** — Backend API, sources, scoring, environment variables, testing
- **[frontend/README.md](./frontend/README.md)** — Frontend setup, pages, components, types, development tips
- **[backend/docs/](./backend/docs/)** — Phase-specific dry-run scripts, handoff guides, setup instructions
  - `cp3_dry_run_script.md`
  - `phase3_to_phase4_handoff.md`
  - `phase4_to_phase5_handoff.md`
  - `GROQ_SETUP.md`
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

### Backend (`backend/.env`)
| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | No | Claude LLM (Phase 3+) |
| `OPENAI_API_KEY` | No | GPT-4o-mini fallback (Phase 3+) |
| `APOLLO_API_KEY` | No | ICP Scout source |
| `HARMONIC_API_KEY` | No | Funded startup discovery |
| `CRUNCHBASE_API_KEY` | No | Company funding data |
| `BUILTWITH_API_KEY` | No | Tech stack detection |
| `REDIS_URL` | No | Draft persistence (optional) |
| `DATABASE_URL` | No | Postgres (optional; defaults to SQLite) |
| `TEMPLATE_ADMIN_TOKEN` | No | Prompt template writes |

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

**Last Updated**: May 4, 2026  
**Current Branch**: `feature/Auggy` (Phase 3–5 Complete)  
**Python**: 3.10+  
**Node.js**: 18+
