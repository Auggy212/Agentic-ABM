# ABM Engine — Schema Layer

## Data Flow

```
Intake Agent
    │
    ▼
MasterContext JSON          ← master_context.schema.json
    │
    ├── company.*           (product, ICP parameters, GTM levers)
    ├── icp.*               (filter criteria for account discovery)
    ├── buyers.*            (persona targeting for outreach)
    ├── competitors.*       (positioning intelligence)
    ├── gtm.*               (channel and CRM configuration)
    └── meta.*              (client_id, version, timestamp)
    │
    ▼
ICP Scout Agent             reads icp.*, company.*, gtm.*
    │
    ▼
ICPAccount JSON (per account)   ← icp_account.schema.json
    │
    ▼
ICPAccountList JSON             ← icp_account_list.schema.json
    │
    ├── accounts[]          (scored + tiered accounts)
    └── meta                (totals, tier breakdown, run info)
    │
    ▼
Phase 2–5 Agents            (Persona Builder, Signal Tracker,
                             Outreach Composer, CRM Sync)
```

All agents **must** validate their input against the relevant schema before
processing. The Pydantic models in `models.py` are the runtime enforcement layer
used by FastAPI; the JSON Schema files in this directory are the canonical
specification consumed by any non-Python agent or external service.

---

## Why `negative_icp` is a required array, never `null`

`negative_icp` lists companies or attributes that ICP Scout must **exclude**
from scored accounts. Two possible states exist:

| State | Correct value | Meaning |
|---|---|---|
| Client has defined exclusions | `["Competitors Inc", "gov only"]` | Filter these out |
| Client has NOT defined exclusions | `[]` (empty array) | No exclusions — proceed |

The field is `required` in the schema and typed `List[str]` (not `Optional`) in
the Pydantic model. This means Pydantic will reject `null` / `None` with a
validation error.

**Why does this matter?**

If `negative_icp` were `Optional[List[str]]`, an agent receiving `None` would
have to guess: "Does `None` mean the client forgot to fill this in, or that
they have no exclusions?" A silent `None` passed into a filter loop typically
causes the filter to be **skipped entirely**, meaning competitors and
blacklisted accounts flow into the pipeline undetected.

By making an empty list an explicit, validated choice, every agent downstream
can safely write:

```python
for exclusion in context.icp.negative_icp:   # always iterable, never None
    ...
```

No `None`-guard needed. No silent data leakage.

**Rule:** If the client skips the exclusion question during intake, the Intake
Agent must store `[]`, not `null`. The intake form should default to `[]` and
ask the user to confirm.

---

## Score → Tier mapping (ICPAccount)

| `icp_score` | `tier` |
|---|---|
| 75–100 | `TIER_1` |
| 50–74 | `TIER_2` |
| 0–49 | `TIER_3` |

The `tier_consistent_with_score` model validator in `models.py` enforces this
at runtime. A mismatched tier (e.g., score=50 but tier=TIER_1) is a validation
error.

---

## Files

| File | Purpose |
|---|---|
| `master_context.schema.json` | JSON Schema for Intake Agent output |
| `icp_account.schema.json` | JSON Schema for a single scored account |
| `icp_account_list.schema.json` | JSON Schema for ICP Scout batch output |
| `models.py` | Pydantic v2 models for FastAPI validation |
| `README.md` | This file |

---

## Phase 3 Verification + CP2

Phase 3 adds the Verifier Agent, the PhantomBuster recent-activity stub, and
Checkpoint 2 review state.

Email verification runs NeverBounce first, then calls ZeroBounce only when the
primary result is `CATCH_ALL` or `RISKY`. That keeps the more expensive fallback
focused on ambiguous cases and prevents silently promoting catch-all inboxes to
valid contacts.

`VerifiedDataPackage.per_source_breakdown` is required because a low
deliverability rate without diagnosis is not actionable. When the target is
missed, `target_miss_diagnosis` must name which source dragged the pass rate
down.

CP2 encodes the deliberate review rule as a schema invariant:
`CP2ReviewState` cannot be `APPROVED` while any inferred claim is still
`PENDING`, or while any account is undecided. Operators must approve, correct,
or remove every inferred claim before Phase 4 can run.

`recent_activity.schema.json` is locked now but remains a stub in Phase 3.
Phase 5 wires PhantomBuster into the existing shape without changing the API
contract.

---

## Phase 4 Storyteller + CP3

Phase 4 introduces the Storyteller Agent and Checkpoint 3 review state.

The generation engine is hybrid and tier-aware: Tier 1 messages route to Claude
and hard-block untraced claims; Tier 2/3 messages route to GPT-4o-mini and
soft-flag untraced claims so the Operator can review them. This gradient keeps
high-value accounts under the strictest factual standard without stopping lower
tier review queues unnecessarily.

Traceability validation runs twice: once immediately after generation and again
when CP3 review state is mutated. This is intentional belt-and-suspenders
coverage for the main Phase 4 risk: Storyteller hallucinations creating
client-facing factual errors.

`diversity_signature` is a normalized hash of the account and buyer hooks. It
exists to catch the "everyone gets the same hook" failure mode before a campaign
feels generic across the list. Diversity failures are visible in CP3 but are not
automatic hard blocks.

CP3 cannot be approved while any client feedback is unresolved. That rule is
encoded as a schema invariant and repeated in the CP3 state manager so client
change requests cannot be bypassed accidentally.

`RECENT_ACTIVITY` is already present as a message `source_type`, but Phase 4
does not populate it. Phase 5 will wire PhantomBuster into the same field, and
the freshness validator is already in place for that handoff.
