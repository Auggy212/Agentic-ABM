# CP2 Review Checklist (45 min)

**Gate**: CP2 sits at the end of Phase 3 (Verifier). The Verifier surfaces every `[INFERRED]` claim from Phase 2 for human review. This checklist prepares the team for that session.

**When to run this**: After Phase 3 (Verifier) completes and before Phase 4 (Storyteller) begins.

---

## Buyer Intel

- [ ] **Spot-check 5 contacts per tier** — do committee role assignments make intuitive sense?
  - DM is the highest-seniority ICP-aligned person (not just any C-suite)
  - Champions are Director/Manager level with ICP-title alignment
  - Blockers are from Finance, Legal, Procurement, IT Security at Director+
- [ ] **Title mismatches flagged** — are the `apollo_title` vs `current_title` discrepancies real?
  - Verifier (Phase 3) uses LinkedIn as source-of-truth for reconciliation
  - If the mismatch is a known promotion/change, mark as resolved
- [ ] **Job change signals correctly identified** — tenure ≤ 6 months → `job_change_signal=true`
  - Verify 3–5 samples to confirm the date math is correct
- [ ] **Quota burn rate sustainable**
  - Apollo: 50 exports/month — check `quota_warnings` in run metadata
  - Hunter: 25/month — Tier 3 contacts shipping as UNVERIFIED is expected
  - Lusha: 5/month — only DMs on Tier 1 accounts should have Lusha data

---

## Signal & Intelligence

- [ ] **Buying stage distribution** — does the spread look sensible across the account list?
  - Should NOT be 100% READY_TO_BUY (that would indicate a miscalibrated model)
  - A healthy distribution: ~10% READY_TO_BUY, ~20% EVALUATING, ~40% SOLUTION_AWARE, ~20% PROBLEM_AWARE, ~10% UNAWARE
- [ ] **LLM_TIEBREAKER cases** — sample 5 accounts where `buying_stage_method=LLM_TIEBREAKER`
  - Does the LLM's `buying_stage_reasoning` string make sense?
  - If the reasoning seems off, document it for Phase 3 retraining/tuning
- [ ] **Signal sources** — check for over-reliance on any single source
  - If 80%+ signals come from Reddit only → source diversity problem
  - Expected mix: LinkedIn Jobs (HIGH), Crunchbase (HIGH), Google News (MEDIUM), G2 (HIGH), Reddit (LOW-MEDIUM)

---

## Intel Reports (Tier 1 only)

- [ ] **Every claim tagged** — check 3–5 intel reports for untagged claims
  - All text in `company_snapshot` must have `[VERIFIED]` or `[INFERRED]` inline
  - `strategic_priorities[*].evidence_status` must be `VERIFIED` or `INFERRED`
  - `competitive_landscape[*].evidence_status` must be `VERIFIED` or `INFERRED`
  - `inferred_pain_points[*].evidence_status` must be `INFERRED` (always)
- [ ] **[VERIFIED] claims trace to real source URLs** — spot-check 3 per report
  - Click the `source_url` and verify the content matches the claim
  - If the URL is dead or irrelevant → change `evidence_status` to `INFERRED`
- [ ] **[INFERRED] claims are reasonable** — not hallucinations
  - Each inferred claim should have a plausible logical basis in the reasoning field
  - Flag any that seem fabricated or implausible — Verifier will block these
- [ ] **Recommended Angle is specific and actionable**
  - Should reference a concrete event (funding, hire, expansion) AND a specific pain point
  - Generic angles ("lead with ROI") fail the test — must be account-specific

---

## Approval Decision

- [ ] All `[INFERRED]` claims reviewed — approved / corrected / removed for each Tier 1 account
- [ ] Buyer profiles approved for Verifier (Phase 3) → Storyteller (Phase 4)
- [ ] Buying stage classifications spot-checked and look sensible
- [ ] Quota burn rates reviewed — any adjustments needed for Phase 3?

**If anything fails**: Re-run the relevant agent (use `POST /api/buyers/discover` or `POST /api/signals/discover`), do NOT proceed to Phase 3 until resolved.

**Sign-off required from**: Product lead + at least one technical reviewer.

---

## Quick Reference: What Phase 3 (Verifier) Will Do

1. Re-verify all emails (NeverBounce/ZeroBounce) — changes `email_status` from UNVERIFIED → VALID/INVALID
2. Reconcile title mismatches via LinkedIn scraping — resolves `title_mismatch_flag`
3. Back-fill `recent_activity` via PhantomBuster — fills empty `[]` arrays
4. Surface all `[INFERRED]` claims in a CP2 UI for operator approval
5. Block Storyteller from using any claim without a CP2 human sign-off
