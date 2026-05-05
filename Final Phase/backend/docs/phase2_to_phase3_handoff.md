# Phase 2 → Phase 3 Handoff

**Phase 2 output**: `BuyerIntelPackage` + `SignalIntelligence` (map of domain → `SignalReport`)
**Phase 3 agent**: Verifier — validates, reconciles, and enriches Phase 2 outputs

---

## What Phase 3 Consumes

### BuyerIntelPackage
- **Table**: `buyer_profiles` — one row per contact, `data` column is the full `BuyerProfile` JSON
- **Key fields Phase 3 must process**:
  - `email` + `email_status` → run full NeverBounce/ZeroBounce verification pass
  - `title_mismatch_flag` → use LinkedIn as source-of-truth to resolve
  - `recent_activity` → `[]` in Phase 2 — PhantomBuster fills this in Phase 3
  - `inferred_pain_points` → surface to CP2 UI for human review
  - `committee_role` + `committee_role_reasoning` → available for CP2 review

### SignalReport with IntelReport
- **Table**: `signal_reports` — one row per (client_id, account_domain)
- **Key fields Phase 3 must process**:
  - `intel_report.company_snapshot` → parse inline `[VERIFIED]`/`[INFERRED]` tags
  - `intel_report.strategic_priorities[*].evidence_status` → validate VERIFIED have real source URLs
  - `intel_report.inferred_pain_points` → all must have `evidence_status=INFERRED` (enforced by schema)
  - `buying_stage` + `buying_stage_method` → available for CP2 review; LLM_TIEBREAKER cases flagged

---

## Known Limitations from Phase 2 (Phase 3 Must Close)

### 1. `recent_activity` is always `[]`
- **Why**: Apollo API does not expose LinkedIn post/activity data
- **Phase 3 fix**: PhantomBuster integration — scrape LinkedIn profile activity and back-fill
- **Impact**: Pain point inference quality will improve after Phase 3

### 2. `title_mismatch_flag` is set but unresolved
- **Why**: Apollo returns the contact's historical title; their current LinkedIn title may differ
- **Phase 3 fix**: LinkedIn scrape (PhantomBuster) + update `current_title`, clear flag
- **Impact**: Storyteller must not use `apollo_title` for personalization — use `current_title` only

### 3. `email_status` is `UNVERIFIED` for most contacts
- **Why**: Hunter.io 25/month free tier covers only Tier 1 + some Tier 2
- **Phase 3 fix**: Run NeverBounce or ZeroBounce verification for all unverified emails
- **Impact**: Campaign (Phase 5) sequences must filter out `INVALID` emails before sending

### 4. `[INFERRED]` claims need human review at CP2
- **Why**: Claude's synthesis in Phase 2 makes inferences without ground-truth validation
- **Phase 3 fix**: Verifier surfaces all `[INFERRED]` claims in CP2 UI; operator approves/corrects
- **Impact**: Storyteller (Phase 4) is blocked from using any claim until CP2 sign-off

---

## Schema Contracts

Both packages conform to the JSON Schema files in `backend/schemas/`:
- `buyer_profile.schema.json` — single contact
- `buyer_intel_package.schema.json` — full package
- `signal_intelligence.schema.json` — per-account signal reports

The Pydantic v2 models in `backend/schemas/models.py` are the authoritative runtime validators.

**Critical constraint**: `intel_report` is only present when `tier == TIER_1`. Phase 3 must check this before attempting to parse the intel report.

---

## Handoff Checklist

- [ ] `buyer_profiles` table has data for all active client accounts
- [ ] `signal_reports` table has data for all active client accounts
- [ ] `buyer_intel_runs` + `signal_intel_runs` show status `complete` (or `complete_with_warnings`)
- [ ] CP2 review checklist completed (`backend/docs/cp2_review_checklist.md`)
- [ ] All `[INFERRED]` claims in intel reports have been reviewed by a human operator
- [ ] Phase 3 environment variables set: `PHANTOMBUSTER_API_KEY`, `NEVERBOUNCE_API_KEY`
