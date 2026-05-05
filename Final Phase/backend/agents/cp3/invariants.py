from __future__ import annotations

from backend.schemas.models import (
    BuyerDecision,
    CP3Blocker,
    CP3ReviewState,
    MessageReviewDecision,
)


def check_cp3_can_approve(state: CP3ReviewState) -> list[CP3Blocker]:
    blockers: list[CP3Blocker] = []
    pending_messages = sum(1 for review in state.message_reviews if review.review_decision == MessageReviewDecision.PENDING)
    if pending_messages:
        blockers.append(CP3Blocker(type="UNREVIEWED_MESSAGES", message=f"{pending_messages} messages still pending review"))
    undecided_buyers = sum(1 for buyer in state.buyer_approvals if buyer.buyer_decision == BuyerDecision.PENDING)
    if undecided_buyers:
        blockers.append(CP3Blocker(type="UNAPPROVED_BUYERS", message=f"{undecided_buyers} buyers not yet decided"))
    unresolved = state.aggregate_progress.client_feedback_unresolved
    if unresolved:
        blockers.append(CP3Blocker(type="UNRESOLVED_CLIENT_FEEDBACK", message=f"{unresolved} client feedback items unresolved"))
    if state.client_completed_at is None:
        blockers.append(CP3Blocker(type="MISSING_CLIENT_SIGNATURE", message="Client has not signed off"))
    return blockers

