"""
Pure validators for CP2 review state.

These functions are called by the state manager and the API handler before any
state mutation that could promote the review to APPROVED. The same checks are
encoded as Pydantic model validators on CP2ReviewState — keeping them as a
standalone module lets API handlers compute the blocker list without raising.
"""

from __future__ import annotations

from typing import List

from backend.schemas.models import (
    AccountDecision,
    CP2Blocker,
    CP2BlockerType,
    CP2ReviewState,
    ReviewDecision,
)


def compute_blockers(state: CP2ReviewState) -> List[CP2Blocker]:
    """
    Return the list of reasons CP2 cannot currently be approved.

    Empty list means CP2 is approvable. Order is stable (claims first, accounts
    second, reviewer third) so UI clients can present blockers consistently.
    """

    blockers: List[CP2Blocker] = []

    pending_claims = sum(
        1 for c in state.inferred_claims_review
        if c.review_decision == ReviewDecision.PENDING
    )
    if pending_claims:
        plural = "claim" if pending_claims == 1 else "claims"
        blockers.append(
            CP2Blocker(
                type=CP2BlockerType.UNREVIEWED_CLAIMS,
                message=f"{pending_claims} {plural} still pending review",
            )
        )

    pending_accounts = sum(
        1 for a in state.account_approvals
        if a.account_decision == AccountDecision.PENDING
    )
    if pending_accounts:
        plural = "account" if pending_accounts == 1 else "accounts"
        blockers.append(
            CP2Blocker(
                type=CP2BlockerType.UNAPPROVED_ACCOUNTS,
                message=f"{pending_accounts} {plural} not yet approved or removed",
            )
        )

    if not state.reviewer:
        blockers.append(
            CP2Blocker(
                type=CP2BlockerType.MISSING_REVIEWER,
                message="reviewer identity is required to approve CP2",
            )
        )

    return blockers


def can_approve(state: CP2ReviewState) -> bool:
    """Convenience: True iff compute_blockers(state) is empty."""

    return not compute_blockers(state)
