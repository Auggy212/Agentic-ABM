"""Apollo vs LinkedIn title reconciliation for Phase 3."""

from __future__ import annotations

from typing import Optional

from backend.schemas.models import ResolutionMethod, TitleReconciliation

TITLE_PENDING_WARNING = (
    "Title reconciliation pending - Phase 5 will resolve via PhantomBuster."
)


def reconcile_title(
    apollo_title: str,
    linkedin_url: Optional[str],
    linkedin_title: Optional[str] = None,
) -> TitleReconciliation:
    """
    Phase 3 cannot scrape LinkedIn, so linkedin_title is normally null.
    Phase 5 can pass a real title and the same schema path will promote it.
    """
    _ = linkedin_url
    if linkedin_title:
        return TitleReconciliation(
            apollo_title=apollo_title,
            linkedin_title=linkedin_title,
            resolved_title=linkedin_title,
            resolution_method=ResolutionMethod.LINKEDIN_PRIMARY,
            mismatch_resolved=True,
        )

    return TitleReconciliation(
        apollo_title=apollo_title,
        linkedin_title=None,
        resolved_title=apollo_title,
        resolution_method=ResolutionMethod.APOLLO_FALLBACK,
        mismatch_resolved=False,
    )
