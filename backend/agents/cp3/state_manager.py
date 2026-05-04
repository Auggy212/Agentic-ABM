from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.db.models import (
    CP3AuditLogRecord,
    CP3BuyerApprovalRecord,
    CP3ClientFeedbackRecord,
    CP3MessageReviewRecord,
    CP3ReviewStateRecord,
    EventRecord,
    MessageRecord,
)
from backend.schemas.models import (
    BuyerApprovalCP3,
    BuyerDecision,
    CP3AggregateProgress,
    CP3ReviewState,
    CP3Status,
    ClientFeedback,
    FeedbackSentiment,
    Message,
    MessageReview,
    MessageReviewDecision,
    OperatorMessageEdit,
)

from .invariants import check_cp3_can_approve


class CP3StateError(Exception):
    pass


class CP3NotFoundError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _aggregate(state: CP3ReviewState) -> CP3AggregateProgress:
    reviewed = [r for r in state.message_reviews if r.review_decision != MessageReviewDecision.PENDING]
    return CP3AggregateProgress(
        total_messages=len(state.message_reviews),
        reviewed_messages=len(reviewed),
        approved_messages=sum(1 for r in state.message_reviews if r.review_decision == MessageReviewDecision.APPROVED),
        edited_messages=sum(1 for r in state.message_reviews if r.review_decision == MessageReviewDecision.EDITED),
        regenerated_messages=sum(1 for r in state.message_reviews if r.review_decision == MessageReviewDecision.REGENERATED),
        total_buyers=len(state.buyer_approvals),
        approved_buyers=sum(1 for b in state.buyer_approvals if b.buyer_decision == BuyerDecision.APPROVED),
        client_feedback_total=len(state.client_feedback),
        client_feedback_unresolved=sum(1 for f in state.client_feedback if not f.resolved),
    )


def _persist(db: Session, record: CP3ReviewStateRecord, state: CP3ReviewState) -> CP3ReviewState:
    rebuilt = state.model_copy(update={"aggregate_progress": _aggregate(state)})
    blockers = check_cp3_can_approve(rebuilt) if rebuilt.status == CP3Status.APPROVED else []
    rebuilt = rebuilt.model_copy(update={"blockers": blockers})
    validated = CP3ReviewState.model_validate(rebuilt.model_dump(mode="json"))
    record.data = validated.model_dump(mode="json")
    record.status = validated.status.value
    record.opened_at = validated.opened_at
    record.approved_at = validated.approved_at
    record.reviewer = validated.reviewer
    record.client_share_token = str(validated.client_share_token) if validated.client_share_token else None
    db.add(record)
    db.commit()
    _sync_child_tables(db, record, validated)
    return validated


def _sync_child_tables(db: Session, record: CP3ReviewStateRecord, state: CP3ReviewState) -> None:
    db.query(CP3MessageReviewRecord).filter(CP3MessageReviewRecord.cp3_state_id == record.id).delete()
    db.query(CP3BuyerApprovalRecord).filter(CP3BuyerApprovalRecord.cp3_state_id == record.id).delete()
    db.query(CP3ClientFeedbackRecord).filter(CP3ClientFeedbackRecord.cp3_state_id == record.id).delete()
    for review in state.message_reviews:
        db.add(CP3MessageReviewRecord(
            cp3_state_id=record.id,
            message_id=str(review.message_id),
            review_decision=review.review_decision.value,
            review_notes=review.review_notes,
            reviewed_at=review.reviewed_at,
            opened_count=review.opened_count,
        ))
    for buyer in state.buyer_approvals:
        db.add(CP3BuyerApprovalRecord(
            cp3_state_id=record.id,
            contact_id=str(buyer.contact_id),
            account_domain=buyer.account_domain,
            buyer_decision=buyer.buyer_decision.value,
            buyer_notes=buyer.buyer_notes,
        ))
    for feedback in state.client_feedback:
        db.add(CP3ClientFeedbackRecord(
            id=str(feedback.feedback_id),
            cp3_state_id=record.id,
            message_id=str(feedback.message_id) if feedback.message_id else None,
            feedback_text=feedback.feedback_text,
            sentiment=feedback.sentiment.value,
            resolved=feedback.resolved,
            resolved_by=feedback.resolved_by,
            resolution_notes=feedback.resolution_notes,
            submitted_at=feedback.submitted_at,
            resolved_at=feedback.resolved_at,
        ))
    db.commit()


def _record(db: Session, client_id: str) -> CP3ReviewStateRecord:
    record = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_id == client_id).first()
    if record is None:
        raise CP3NotFoundError(client_id)
    return record


def _state(record: CP3ReviewStateRecord) -> CP3ReviewState:
    return CP3ReviewState.model_validate(record.data)


def _audit(db: Session, client_id: str, action: str, reviewer: str, before: Any = None, after: Any = None) -> None:
    db.add(CP3AuditLogRecord(client_id=client_id, action=action, reviewer=reviewer, before_state=before, after_state=after))
    db.commit()


def open_review(client_id: str, reviewer: str, db: Session) -> CP3ReviewState:
    existing = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_id == client_id).first()
    if existing is not None:
        return _state(existing)
    rows = db.query(MessageRecord).filter(MessageRecord.client_id == client_id).all()
    reviews = [
        MessageReview(message_id=uuid.UUID(row.id), review_decision=MessageReviewDecision.PENDING, operator_edits=[], review_notes=None, reviewed_at=None, opened_count=0)
        for row in rows
    ]
    buyers: dict[str, BuyerApprovalCP3] = {}
    for row in rows:
        msg = Message.model_validate(row.data)
        if msg.contact_id is None:
            continue
        buyers[str(msg.contact_id)] = BuyerApprovalCP3(
            contact_id=msg.contact_id,
            account_domain=msg.account_domain,
            all_messages_reviewed=False,
            buyer_decision=BuyerDecision.PENDING,
            buyer_notes=None,
        )
    state = CP3ReviewState(
        client_id=uuid.UUID(client_id),
        status=CP3Status.OPERATOR_REVIEW,
        opened_at=_now(),
        operator_completed_at=None,
        client_share_sent_at=None,
        client_completed_at=None,
        approved_at=None,
        reviewer=reviewer,
        client_share_token=None,
        client_share_email=None,
        client_review_sample_ids=[],
        message_reviews=reviews,
        buyer_approvals=list(buyers.values()),
        client_feedback=[],
        aggregate_progress=CP3AggregateProgress(
            total_messages=len(reviews), reviewed_messages=0, approved_messages=0, edited_messages=0,
            regenerated_messages=0, total_buyers=len(buyers), approved_buyers=0,
            client_feedback_total=0, client_feedback_unresolved=0,
        ),
        blockers=[],
    )
    record = CP3ReviewStateRecord(client_id=client_id, data={})
    persisted = _persist(db, record, state)
    _audit(db, client_id, "OPEN_REVIEW", reviewer, after={"total_messages": len(reviews)})
    return persisted


def get_state(client_id: str, db: Session) -> CP3ReviewState:
    return _state(_record(db, client_id))


def review_message(message_id: str, decision: MessageReviewDecision, reviewer: str, db: Session, *, edits: Optional[list[dict]] = None, review_notes: Optional[str] = None) -> MessageReview:
    msg_row = db.query(MessageRecord).filter(MessageRecord.id == message_id).first()
    if msg_row is None:
        raise CP3NotFoundError(message_id)
    record = _record(db, msg_row.client_id)
    state = _state(record)
    idx = next((i for i, r in enumerate(state.message_reviews) if str(r.message_id) == message_id), None)
    if idx is None:
        raise CP3NotFoundError(message_id)
    operator_edits = list(state.message_reviews[idx].operator_edits)
    if decision == MessageReviewDecision.EDITED and edits:
        data = dict(msg_row.data)
        for edit in edits:
            layer = edit.get("layer", "body")
            before = str(edit.get("before", data.get(layer, data.get("body", ""))))
            after = str(edit.get("after", ""))
            if layer in {"subject", "body"}:
                data[layer] = after
            operator_edits.append(OperatorMessageEdit(layer=layer, before=before, after=after, edited_at=_now()))
        data.setdefault("operator_edit_history", []).append({
            "edited_at": _now().isoformat(),
            "edited_by": reviewer,
            "before": msg_row.data.get("body", ""),
            "after": data.get("body", ""),
            "reason": review_notes or "Operator edit during CP3",
        })
        msg_row.data = data
        msg_row.review_state = "EDITED_BY_OPERATOR"
        db.add(msg_row)
    updated = state.message_reviews[idx].model_copy(update={
        "review_decision": decision,
        "operator_edits": operator_edits,
        "review_notes": review_notes,
        "reviewed_at": _now() if decision != MessageReviewDecision.PENDING else None,
    })
    reviews = list(state.message_reviews)
    reviews[idx] = updated
    _persist(db, record, state.model_copy(update={"message_reviews": reviews}))
    _audit(db, msg_row.client_id, f"REVIEW_MESSAGE_{decision.value}", reviewer, after={"message_id": message_id})
    return updated


def increment_opened(message_id: str, db: Session) -> int:
    msg_row = db.query(MessageRecord).filter(MessageRecord.id == message_id).first()
    if msg_row is None:
        raise CP3NotFoundError(message_id)
    record = _record(db, msg_row.client_id)
    state = _state(record)
    reviews = []
    count = 0
    for review in state.message_reviews:
        if str(review.message_id) == message_id:
            count = review.opened_count + 1
            reviews.append(review.model_copy(update={"opened_count": count}))
        else:
            reviews.append(review)
    _persist(db, record, state.model_copy(update={"message_reviews": reviews}))
    return count


def approve_buyer(client_id: str, contact_id: str, reviewer: str, db: Session, *, buyer_notes: Optional[str] = None) -> BuyerApprovalCP3:
    record = _record(db, client_id)
    state = _state(record)
    message_rows = db.query(MessageRecord).filter(MessageRecord.client_id == client_id, MessageRecord.contact_id == contact_id).all()
    reviewed_ids = {str(r.message_id) for r in state.message_reviews if r.review_decision != MessageReviewDecision.PENDING}
    if any(row.id not in reviewed_ids for row in message_rows):
        raise CP3StateError("Cannot approve buyer until every message is reviewed")
    buyers = []
    updated = None
    for buyer in state.buyer_approvals:
        if str(buyer.contact_id) == contact_id:
            updated = buyer.model_copy(update={"all_messages_reviewed": True, "buyer_decision": BuyerDecision.APPROVED, "buyer_notes": buyer_notes})
            buyers.append(updated)
        else:
            buyers.append(buyer)
    if updated is None:
        raise CP3NotFoundError(contact_id)
    _persist(db, record, state.model_copy(update={"buyer_approvals": buyers}))
    _audit(db, client_id, "APPROVE_BUYER", reviewer, after={"contact_id": contact_id})
    return updated


def mark_operator_complete(client_id: str, reviewer: str, db: Session) -> CP3ReviewState:
    record = _record(db, client_id)
    state = _state(record)
    if any(review.opened_count < 1 for review in state.message_reviews):
        raise CP3StateError("Every message must be opened before operator completion")
    if any(buyer.buyer_decision == BuyerDecision.PENDING for buyer in state.buyer_approvals):
        raise CP3StateError("Every buyer must be decided before operator completion")
    return _persist(db, record, state.model_copy(update={"status": CP3Status.CLIENT_REVIEW, "operator_completed_at": _now(), "reviewer": reviewer}))


def send_to_client(client_id: str, client_email: str, sample_message_ids: list[str], db: Session) -> dict[str, str]:
    record = _record(db, client_id)
    state = _state(record)
    if state.status != CP3Status.CLIENT_REVIEW:
        raise CP3StateError("CP3 must be in CLIENT_REVIEW before sending")
    token = uuid.uuid4()
    app_url = os.environ.get("APP_URL", "http://localhost:5173")
    updated = state.model_copy(update={
        "client_share_token": token,
        "client_share_email": client_email,
        "client_share_sent_at": _now(),
        "client_review_sample_ids": [uuid.UUID(mid) for mid in sample_message_ids],
    })
    _persist(db, record, updated)
    return {"share_url": f"{app_url}/client-review/{token}", "email_status": "manual_send_required"}


def submit_client_feedback(share_token: str, feedback_payload: dict[str, Any], db: Session) -> ClientFeedback:
    record = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_share_token == share_token).first()
    if record is None:
        raise CP3NotFoundError(share_token)
    state = _state(record)
    if state.status != CP3Status.CLIENT_REVIEW:
        raise CP3StateError("Client review is not open")
    feedback = ClientFeedback(
        feedback_id=uuid.uuid4(),
        message_id=uuid.UUID(feedback_payload["message_id"]) if feedback_payload.get("message_id") else None,
        feedback_text=feedback_payload["feedback_text"],
        sentiment=FeedbackSentiment(feedback_payload["sentiment"]),
        resolved=False,
        resolved_by=None,
        resolution_notes=None,
        submitted_at=_now(),
        resolved_at=None,
    )
    status = CP3Status.CHANGES_REQUESTED if feedback.sentiment == FeedbackSentiment.CHANGE_REQUEST else state.status
    _persist(db, record, state.model_copy(update={"client_feedback": [*state.client_feedback, feedback], "status": status}))
    return feedback


def resolve_feedback(client_id: str, feedback_id: str, resolution_notes: str, reviewer: str, db: Session) -> ClientFeedback:
    record = _record(db, client_id)
    state = _state(record)
    feedbacks = []
    updated = None
    for feedback in state.client_feedback:
        if str(feedback.feedback_id) == feedback_id:
            updated = feedback.model_copy(update={"resolved": True, "resolved_by": reviewer, "resolution_notes": resolution_notes, "resolved_at": _now()})
            feedbacks.append(updated)
        else:
            feedbacks.append(feedback)
    if updated is None:
        raise CP3NotFoundError(feedback_id)
    status = CP3Status.CLIENT_REVIEW if all(f.resolved for f in feedbacks) else state.status
    _persist(db, record, state.model_copy(update={"client_feedback": feedbacks, "status": status}))
    return updated


def client_approve(share_token: str, reviewer_signature_name: str, db: Session) -> CP3ReviewState:
    record = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_share_token == share_token).first()
    if record is None:
        raise CP3NotFoundError(share_token)
    state = _state(record)
    if state.aggregate_progress.client_feedback_unresolved != 0:
        raise CP3StateError("Client feedback must be resolved before approval")
    return _persist(db, record, state.model_copy(update={"client_completed_at": _now(), "reviewer": reviewer_signature_name}))


def approve_cp3(client_id: str, reviewer_notes: str | None, reviewer: str, db: Session) -> CP3ReviewState:
    record = _record(db, client_id)
    state = _state(record)
    blockers = check_cp3_can_approve(state)
    if blockers:
        _persist(db, record, state.model_copy(update={"blockers": blockers}))
        raise CP3StateError("; ".join(b.message for b in blockers))
    approved = state.model_copy(update={"status": CP3Status.APPROVED, "approved_at": _now(), "reviewer": reviewer})
    persisted = _persist(db, record, approved)
    db.add(EventRecord(client_id=client_id, event_type="cp3.approved", payload={"reviewer_notes": reviewer_notes}))
    db.commit()
    return persisted
