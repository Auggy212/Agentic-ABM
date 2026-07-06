"""Overall data quality scoring for Phase 3 VerificationResult rows."""

from __future__ import annotations

from typing import Iterable, Optional

_MAX_POSSIBLE_SCORE = 40 + 15 + 10 + 15 + 10 + 10  # must equal 100
assert _MAX_POSSIBLE_SCORE == 100, f"Quality score weights must sum to 100, got {_MAX_POSSIBLE_SCORE}"

from backend.schemas.models import (
    EmailFinalStatus,
    JobChangeVerification,
    TitleReconciliation,
    VerificationIssue,
    VerificationIssueSeverity,
)

_EMAIL_POINTS = {
    EmailFinalStatus.VALID: 40,
    EmailFinalStatus.CATCH_ALL: 25,
    EmailFinalStatus.RISKY: 15,
    EmailFinalStatus.INVALID: 0,
    EmailFinalStatus.NOT_FOUND: 0,
}


def _linkedin_points(reachable: Optional[bool]) -> int:
    if reachable is True:
        return 15
    if reachable is False:
        return 5
    return 8


def compute_overall_data_quality_score(
    *,
    email_status: EmailFinalStatus,
    linkedin_reachable: Optional[bool],
    website_reachable: bool,
    title_reconciliation: TitleReconciliation,
    job_change_verification: JobChangeVerification,
    issues: Iterable[VerificationIssue],
) -> int:
    score = 0
    score += _EMAIL_POINTS[email_status]
    score += _linkedin_points(linkedin_reachable)
    score += 10 if website_reachable else 0
    score += 15 if title_reconciliation.mismatch_resolved else 8
    score += 10 if job_change_verification.verified else 0
    score += 10 if not any(i.severity == VerificationIssueSeverity.ERROR for i in issues) else 0
    return max(0, min(score, 100))
