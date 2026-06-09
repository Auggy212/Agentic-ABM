# ABM Engine — Backend

FastAPI Python backend for the Agentic Account-Based Marketing Engine.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # fill in API keys
uvicorn backend.main:app --reload --port 3001
```

## API Keys

| Variable | Purpose | Free Tier Limit |
|---|---|---|
| `APOLLO_API_KEY` | Company discovery & contact enrichment | 50 exports/month |
| `HARMONIC_API_KEY` | Funded startup discovery, headcount growth signals | 100 queries/month |
| `CRUNCHBASE_API_KEY` | Funding rounds, location, industry data | 200 results/month |
| `BUILTWITH_API_KEY` | Technology stack detection (e.g. "find all companies using HubSpot") | 100 lookups/month |
| `REDIS_URL` | Draft persistence, quota tracking | — |
| `DATABASE_URL` | Postgres for MasterContext, account, and run records | — |
| `ANTHROPIC_API_KEY` | LLM features in later phases | — |

If an API key is absent, the corresponding ICP Scout source adapter logs a warning and
returns an empty list — the pipeline continues with whatever other sources return.

## Running Tests

```bash
pytest backend/tests/ -v
```

## API Endpoints

### Intake Agent

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/intake` | Validate and emit MasterContext |
| `POST` | `/api/intake/draft` | Save draft to Redis (7-day TTL) |
| `GET` | `/api/intake/draft/{client_id}` | Resume a saved draft |
| `POST` | `/api/intake/csv` | Upload existing account CSV |

### ICP Accounts

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/accounts/discover` | Run ICP Scout discovery for a client |
| `GET` | `/api/accounts?client_id=X` | List active accounts (paginated, sortable by tier) |
| `GET` | `/api/accounts/{account_id}` | Fetch a single account |
| `DELETE` | `/api/accounts/{account_id}` | Soft-delete an account |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |

## ICP Scout Sources

The ICP Scout Agent queries sources in parallel. Quota is tracked in Redis
(`quota:{SOURCE}:{YYYY-MM}`) and soft-enforced — exhaustion skips that source
but doesn't abort the run.

| Source | What it finds | Monthly quota |
|---|---|---|
| Apollo.io | Companies by industry, location, tech stack | 50 |
| Harmonic.ai | Funded startups with headcount growth | 100 |
| Crunchbase | Companies by funding stage and geography | 200 |
| BuiltWith | Companies using a specific technology | 100 |
| Client Upload | Pre-existing account list (CSV) — bypasses all APIs | unlimited |

## Scoring

Accounts are scored 0–100 across six weighted dimensions:

| Dimension | Weight |
|---|---|
| Industry match | 25 |
| Company size | 20 |
| Tech stack | 20 |
| Geography | 15 |
| Funding stage | 10 |
| Buying triggers | 10 |

## Phase 4 Storyteller + CP3

Additional environment variables:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Tier 2/3 Storyteller generation |
| `ANTHROPIC_RUN_BUDGET_USD` | Per-run Claude budget cap |
| `OPENAI_RUN_BUDGET_USD` | Per-run GPT-4o-mini budget cap |
| `TEMPLATE_ADMIN_TOKEN` | Temporary admin gate for prompt template writes |

Seed prompt templates:

```bash
python backend/scripts/seed_templates.py
```

Storyteller uses mock LLM clients by default (`STORYTELLER_USE_MOCK=1`) so local
generation exercises validation and cost accounting without real API spend.

Phase 4 endpoints:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/storyteller/generate` | Generate Storyteller messages after CP2 approval |
| `GET` | `/api/storyteller/messages?client_id=X` | List generated messages |
| `GET` | `/api/templates` | List active prompt templates |
| `POST` | `/api/templates` | Create a prompt template version (`TEMPLATE_ADMIN_TOKEN`) |
| `GET` | `/api/checkpoint-3?client_id=X` | Open or fetch CP3 review state |
| `POST` | `/api/checkpoint-3/approve?client_id=X` | Final Operator CP3 approval |
| `GET` | `/api/client-review/{token}` | Sanitized token-gated client review payload |

Team docs:

- `backend/docs/cp3_dry_run_script.md`
- `backend/docs/phase4_to_phase5_handoff.md`

Tiers: **TIER_1** ≥ 80 · **TIER_2** 60–79 · **TIER_3** < 60
