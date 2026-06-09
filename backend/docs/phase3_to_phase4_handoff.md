# Phase 3 to Phase 4 Handoff

Storyteller consumes only reviewed and verified Phase 3 data.

- Use `VerifiedDataPackage` contacts where `final_status` is `VALID` or `CATCH_ALL`.
- Use buyer pain points only when their CP2 decision is `APPROVED` or `CORRECTED`.
- Use intel report claims only when verified by source evidence or approved through CP2.
- Exclude accounts with `REMOVED_FROM_PIPELINE`.

Known Phase 3 limits:

- `RecentActivityStub` is empty until PhantomBuster is wired in Phase 5.
- Title reconciliation falls back to Apollo when LinkedIn title scraping is unavailable.
- Hunter quota may be partially consumed by Phase 3 re-lookups; Phase 4 should not assume more email finding capacity.

Phase 4 must call `assert_cp2_approved(client_id)` before drafting outreach.
