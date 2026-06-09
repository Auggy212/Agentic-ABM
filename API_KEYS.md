# API Keys Reference

Complete list of API keys and environment variables required to run the ABM Engine end-to-end.

---

## Minimum to Run Locally

You need at least these two to get the app working end-to-end:

| Key | Where to Get | Cost |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Pay-per-token; ~$50/run cap set via `ANTHROPIC_RUN_BUDGET_USD` |
| `APOLLO_API_KEY` | [developer.apollo.io](https://developer.apollo.io) | Free: 50 exports/month; Paid from ~$49/mo |

---

## LLM Keys (Core Agents)

All agents — Intake, ICP Scout, Storyteller, Verifier, Campaign, Sales Handoff — are powered by these.

| Key | Purpose | Free Tier | Paid |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Primary LLM for all agents | No free tier | Pay-per-token (budget capped at `ANTHROPIC_RUN_BUDGET_USD=50`) |
| `OPENAI_API_KEY` | Tier 2/3 Storyteller generation | No free tier | Pay-per-token (budget capped at `OPENAI_RUN_BUDGET_USD=20`) |
| `GROQ_API_KEY` | Fast/cheap LLM fallback | Free tier available | Pay-per-token |

---

## Data Pipeline Keys (ICP Scout & Enrichment)

Used during company discovery, scoring, and contact enrichment phases.

| Key | Purpose | Free Tier | Paid |
|---|---|---|---|
| `APOLLO_API_KEY` | Company + contact data (primary ICP source) | 50 exports/month | From ~$49/mo |
| `CRUNCHBASE_API_KEY` | Funding rounds & location data | None | Basic ~$29/mo (200 results) |
| `HARMONIC_API_KEY` | Funded startup discovery with hiring signals | None | Contact sales |
| `BUILTWITH_API_KEY` | Tech stack detection by domain | None | From ~$295/mo |
| `CLAY_API_KEY` | Clay enrichment workflows | None | From ~$149/mo |

---

## Email Validation Keys

Used to verify contact emails before outbound sequences are launched.

| Key | Purpose | Free Tier | Paid |
|---|---|---|---|
| `HUNTER_API_KEY` | Email discovery by domain | 25 searches/month | From ~$34/mo |
| `NEVERBOUNCE_API_KEY` | Email validation (primary) | None | ~$0.003/email |
| `ZEROBOUNCE_API_KEY` | Email validation fallback | 100 credits | ~$0.004/email |

---

## Outbound & Campaign Keys (Phase 5)

Required for launching email sequences and processing replies.

| Key | Purpose | Free Tier | Paid |
|---|---|---|---|
| `INSTANTLY_API_KEY` | Outbound email automation & campaign delivery | None | From ~$37/mo |
| `INSTANTLY_WEBHOOK_SECRET` | Webhook HMAC signature verification for reply events | Included with Instantly | — |
| `PHANTOMBUSTER_WEBHOOK_SECRET` | PhantomBuster webhook validation | Included with plan | — |

---

## CRM & Communications Keys

| Key | Purpose | Free Tier | Paid |
|---|---|---|---|
| `HUBSPOT_API_KEY` | CRM sync (contacts, deals, activities) | Free CRM; API access free | — |
| `TWILIO_ACCOUNT_SID` | SMS / calling integrations | Trial credits | ~$0.0085/SMS |
| `TWILIO_AUTH_TOKEN` | Paired with Account SID for request signing | Included | — |

---

## Infrastructure & Auth (Not API Keys)

These are required config values, not third-party API keys.

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Defaults to SQLite (`abm_engine.db`) for local dev |
| `REDIS_URL` | Redis for caching and queues | Optional for local dev |
| `SECRET_KEY` | JWT auth signing secret | Change before deploying to production |
| `TEMPLATE_ADMIN_TOKEN` | Authorizes prompt template write endpoints | Any strong random string |

---

## Budget Caps

These env vars limit per-run LLM spend to prevent runaway costs:

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_RUN_BUDGET_USD` | `50` | Max USD per run for Anthropic calls |
| `OPENAI_RUN_BUDGET_USD` | `20` | Max USD per run for OpenAI calls |
| `REPLY_CLASSIFIER_DAILY_BUDGET_USD` | `5.0` | Daily cap on Claude calls in the reply classifier |

> Set `REPLY_CLASSIFIER_USE_MOCK=1` to bypass the reply classifier LLM and use the regex fallback (useful for development).

---

## First Test Run: ICP Scout + Signal Capture

Estimated cost for a **10–20 account test run**.

### APIs Required

| API | Used By | Free Tier |
|-----|---------|-----------|
| `APOLLO_API_KEY` | ICP Scout (company discovery) + Signal Intel (job signals) | 50 exports/month |
| `HARMONIC_API_KEY` | ICP Scout (funded startup discovery) | 100 calls/month |
| `CRUNCHBASE_API_KEY` | ICP Scout (funding data) + Signal Intel (funding signals) | 200 results/month |
| `BUILTWITH_API_KEY` | ICP Scout (tech stack detection) | 100 calls/month |
| `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Signal Intel (pain point signals) | Free (60 req/min) |
| `ANTHROPIC_API_KEY` | Signal Intel (buying stage classifier + intel synthesis) | Pay-per-token |
| `PERPLEXITY_API_KEY` | Signal Intel (Tier 1 deep research, stage 1) | Pay-per-token |
| Google News RSS | Signal Intel (funding/expansion news) | Free, no key needed |
| G2 scraping | Signal Intel (competitor review signals) | Free, no key needed |

### Cost Breakdown (10–20 accounts)

| Service | Usage | Estimated Cost |
|---------|-------|---------------|
| Apollo, Harmonic, Crunchbase, BuiltWith | Well within free tier limits | $0.00 |
| Reddit, Google News, G2 | No charge | $0.00 |
| Perplexity | ~4 queries × 5 Tier 1 accounts | ~$0.02 |
| Anthropic (classifier) | ~10 classifier calls × ~150 tokens | ~$0.05 |
| Anthropic (intel synthesis) | ~5 reports × ~5000 tokens total | ~$0.20 |
| **Total** | | **~$0.25–$0.35** |

> **Note on Crunchbase:** The Basic API tier requires approval and costs ~$29/mo in production. Use their free trial or legacy Basic key for the initial test. Verify your access level before running.

### Token & Cost Tracking Log (fill in during test run)

Track every action below during the test. This data will feed client pricing calculations.

#### ICP Scout

| Action | Input Tokens | Output Tokens | Model | Cost ($) | Notes |
|--------|-------------|--------------|-------|----------|-------|
| Company discovery (Apollo) | — | — | — | $0.00 | API call, no LLM |
| Company discovery (Harmonic) | — | — | — | $0.00 | API call, no LLM |
| Company discovery (Crunchbase) | — | — | — | $0.00 | API call, no LLM |
| Tech stack lookup (BuiltWith) | — | — | — | $0.00 | API call, no LLM |
| ICP scoring (rule-based) | — | — | — | $0.00 | No LLM |

#### Signal Capture

| Action | Input Tokens | Output Tokens | Model | Cost ($) | Notes |
|--------|-------------|--------------|-------|----------|-------|
| Funding signal (Crunchbase) | — | — | — | $0.00 | API call, no LLM |
| News signal (Google RSS) | — | — | — | $0.00 | Free RSS |
| Competitor signal (G2) | — | — | — | $0.00 | Web scrape |
| Job signal (Apollo) | — | — | — | $0.00 | API call, no LLM |
| Reddit signal | — | — | — | $0.00 | Free API |
| Buying stage classifier (per call) | | | claude-sonnet-4-6 | | ~150 tokens/call expected |
| Intel report — Perplexity research (per account) | | | llama-3.1-sonar-large | | 4 parallel queries |
| Intel report — Claude synthesis (per account) | | | claude-sonnet-4-6 | | ~2000 output tokens expected |

#### Pricing Reference (as of May 2026)

| Model | Input ($/MTok) | Output ($/MTok) |
|-------|---------------|----------------|
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-opus-4-7 | $15.00 | $75.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |
| llama-3.1-sonar-large (Perplexity) | $1.00 | $1.00 |

#### Per-Account Cost Summary (fill in after test)

| Account Tier | ICP Scout Cost | Signal Capture Cost | Total per Account | Notes |
|-------------|---------------|--------------------|--------------------|-------|
| Tier 1 | | | | Includes intel report |
| Tier 2 | | | | No intel report |
| Tier 3 | | | | Minimal signals only |
| **Avg across all tiers** | | | | Use for client pricing |

> **Client pricing formula (draft):** `margin_multiplier × avg_cost_per_account × accounts_per_run + flat_platform_fee`
> Fill in avg cost per account after the test run to calibrate this.

---

## Quick Setup Checklist

```
# Absolute minimum for local end-to-end run
ANTHROPIC_API_KEY=...
APOLLO_API_KEY=...
SECRET_KEY=...                  # any random string

# Add these to unlock outbound (Phase 5)
INSTANTLY_API_KEY=...
HUNTER_API_KEY=...
NEVERBOUNCE_API_KEY=...

# Add these for richer enrichment
CRUNCHBASE_API_KEY=...
BUILTWITH_API_KEY=...

# Infrastructure (leave as default for local SQLite/no-Redis)
# DATABASE_URL=postgresql://user:password@localhost:5432/abm_engine
# REDIS_URL=redis://localhost:6379
```
