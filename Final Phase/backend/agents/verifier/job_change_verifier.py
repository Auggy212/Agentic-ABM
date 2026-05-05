"""Verify Apollo job-change signals for Phase 3."""

from __future__ import annotations

from typing import Any, Optional

from backend.schemas.models import BuyerProfile, JobChangeVerification

APOLLO_ONLY_JOB_CHANGE_WARNING = (
    "Job change confidence is 0.6 - Apollo-only signal. "
    "Phase 5 will cross-verify via LinkedIn activity."
)


def verify_job_change(
    contact: BuyerProfile,
    recent_activity: Optional[Any] = None,
) -> JobChangeVerification:
    apollo_claimed = bool(contact.job_change_signal)
    linkedin_confirmed = None

    if recent_activity is not None:
        linkedin_confirmed = bool(getattr(recent_activity, "confirms_job_change", False))

    verified = bool(linkedin_confirmed) if linkedin_confirmed is not None else apollo_claimed
    confidence = 0.95 if linkedin_confirmed else 0.6

    return JobChangeVerification(
        apollo_claimed=apollo_claimed,
        linkedin_confirmed=linkedin_confirmed,
        verified=verified,
        confidence=confidence,
    )
