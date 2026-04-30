"""Recent activity stub agent for Phase 3."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.schemas.models import (
    BuyerIntelPackage,
    DataFreshness,
    RecentActivitySource,
    RecentActivityStub,
)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def build_empty_stub(contact_id) -> RecentActivityStub:
    return RecentActivityStub(
        contact_id=contact_id,
        posts=[],
        comments=[],
        likes=[],
        last_active_at=None,
        data_freshness=DataFreshness.STALE,
        source=RecentActivitySource.PHANTOMBUSTER,
        scraped_at=_now(),
    )


class RecentActivityAgent:
    """
    STUB — wires to PhantomBuster in Phase 5. Returns empty activity for all contacts in Phase 3.
    """

    async def run(
        self,
        client_id: str,
        buyer_intel_package: BuyerIntelPackage,
    ) -> dict[str, RecentActivityStub]:
        _ = client_id
        stubs: dict[str, RecentActivityStub] = {}
        for contacts in buyer_intel_package.accounts.values():
            for contact in contacts:
                stubs[str(contact.contact_id)] = build_empty_stub(contact.contact_id)
        return stubs
