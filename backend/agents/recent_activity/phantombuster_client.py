"""PhantomBuster client stub for Phase 3."""

from __future__ import annotations

from backend.schemas.models import RecentActivityStub


class PhantomBusterClient:
    def scrape_profile_activity(self, linkedin_url: str) -> RecentActivityStub:
        """
        Scrape LinkedIn profile activity via PhantomBuster in Phase 5.

        Phase 5 must implement:
        - Cookie management for LinkedIn session cookies, including refresh strategy.
        - Rate limiting for the PhantomBuster free tier of 2 hours/day.
        - Heartbeat checks that detect LinkedIn cookie expiry mid-run and halt with
          an Operator alert instead of silently returning empty data.
        - Filtering for posts/comments/likes older than 90 days so outreach hooks
          do not feel stale or creepy.
        """
        _ = linkedin_url
        raise NotImplementedError("PhantomBuster client deferred to Phase 5")
