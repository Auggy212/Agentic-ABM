# Phase 5 PhantomBuster Wiring Guide

The schema, agent, and endpoints exist. Phase 5 only replaces the stub.

### Files to modify (no new files needed)

- `backend/agents/recent_activity/phantombuster_client.py` - replace NotImplementedError with real PhantomBuster API calls.
- `backend/agents/recent_activity/agent.py` - change from "return empty stub" to "call client and return scraped data".

### What to implement

1. PhantomBuster Phantom for LinkedIn Profile Scraper - set up via PB dashboard, get the agent ID.
2. Cookie management: store `li_at` cookie in env or secret store; rotate weekly.
3. Cookie expiry detection: if PB returns 0 results across 5+ profiles in a row, assume cookie dead -> halt run, alert Operator. (User Journey risk fix.)
4. Rate budget: 2 hrs/day free tier. With ~30 sec/profile, that's ~240 profiles/day. Stagger across multiple days for large lists.
5. Post filtering: only retain posts <=90 days old. Older posts feel stale and creepy as outreach hooks (User Journey risk).
6. Update `has_data=true` and `data_freshness` based on `last_active_at`.

### What NOT to change

- Schema (`recent_activity.schema.json`) - locked.
- Pydantic model (`RecentActivityStub`) - locked.
- Endpoint shapes - locked.
- Database table - locked.

### Acceptance

- Real PhantomBuster scrape returns populated arrays for >=80% of contacts with valid LinkedIn URLs.
- Cookie expiry triggers alert, not silent failure.
- All Phase 3 tests still pass.
