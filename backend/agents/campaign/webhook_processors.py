from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.agents.campaign import circuit_breaker, engagement_scorer
from backend.agents.campaign.handoff_generator import generate_tldr
from backend.agents.campaign.reply_classifier import ReplyLabel, classify
from backend.agents.cp4 import state_manager as cp4_state
from backend.db.models import (
    AccountPauseRecord,
    EngagementEventRecord,
    OutboundSendRecord,
    WebhookReceiptRecord,
)
from backend.schemas.models import (
    EngagementChannel,
    EngagementEventType,
    HandoffTriggerEvent,
    HandoffTriggerEventType,
    SendStatus,
    WebhookProvider,
)


# Map engagement event -> the matching CP4 trigger type. Only the four positive
# signals on the handoff doc are eligible to be recorded as triggering_events.
_HANDOFF_TRIGGER_MAP: dict[EngagementEventType, HandoffTriggerEventType] = {
    EngagementEventType.EMAIL_REPLY: HandoffTriggerEventType.EMAIL_REPLY,
    EngagementEventType.LINKEDIN_DM_REPLY: HandoffTriggerEventType.LINKEDIN_DM_REPLY,
    EngagementEventType.WHATSAPP_REPLY: HandoffTriggerEventType.WHATSAPP_REPLY,
    EngagementEventType.MEETING_BOOKED: HandoffTriggerEventType.MEETING_BOOKED,
}


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def record_receipt(
    db: Session,
    *,
    provider: WebhookProvider,
    provider_event_id: str,
    raw_payload: dict,
) -> bool:
    """
    Insert a WebhookReceipt row for idempotency. Returns True if this is a new
    receipt (caller should process), False if it has already been seen
    (caller should short-circuit). Concurrency-safe: a duplicate insert hits
    the unique index and is treated as 'already seen'.
    """
    try:
        db.add(WebhookReceiptRecord(
            provider=provider.value,
            provider_event_id=provider_event_id,
            raw_payload=raw_payload,
        ))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def correlate_send(db: Session, transport: str, provider_message_id: str) -> Optional[OutboundSendRecord]:
    return (
        db.query(OutboundSendRecord)
        .filter(
            OutboundSendRecord.transport == transport,
            OutboundSendRecord.provider_message_id == provider_message_id,
        )
        .order_by(OutboundSendRecord.attempted_at.desc())
        .first()
    )


def pause_account(
    db: Session,
    *,
    client_id: str,
    account_domain: str,
    contact_id: Optional[str],
    reason: str,
    detail: str,
) -> AccountPauseRecord:
    """Idempotent: if an active pause already exists for the account, return it."""
    existing = (
        db.query(AccountPauseRecord)
        .filter(
            AccountPauseRecord.client_id == client_id,
            AccountPauseRecord.account_domain == account_domain,
            AccountPauseRecord.resumed_at.is_(None),
        )
        .first()
    )
    if existing is not None:
        return existing
    record = AccountPauseRecord(
        client_id=client_id,
        account_domain=account_domain,
        contact_id=contact_id,
        reason=reason,
        detail=detail,
    )
    db.add(record)
    db.commit()
    return record


def is_account_paused(db: Session, *, client_id: str, account_domain: str) -> bool:
    return (
        db.query(AccountPauseRecord)
        .filter(
            AccountPauseRecord.client_id == client_id,
            AccountPauseRecord.account_domain == account_domain,
            AccountPauseRecord.resumed_at.is_(None),
        )
        .first()
        is not None
    )


def _record_event(
    db: Session,
    *,
    client_id: str,
    account_domain: str,
    contact_id: Optional[str],
    channel: EngagementChannel,
    event_type: EngagementEventType,
    occurred_at: datetime,
    provider: WebhookProvider,
    provider_event_id: str,
    raw: dict,
) -> EngagementEventRecord:
    record = EngagementEventRecord(
        client_id=client_id,
        account_domain=account_domain,
        contact_id=contact_id,
        channel=channel.value,
        event_type=event_type.value,
        score_delta=engagement_scorer.score_event(event_type),
        occurred_at=occurred_at,
        provider=provider.value,
        provider_event_id=provider_event_id,
        data=raw,
    )
    db.add(record)
    db.commit()
    return record


def _maybe_create_handoff(
    db: Session,
    *,
    client_id: str,
    account_domain: str,
    contact_id: Optional[str],
) -> None:
    """If account engagement_score >= 60 and we have a contact, create a CP4
    handoff. Idempotent on (client, account, contact). The TL;DR is a
    placeholder here; Deliverable D wires in the LLM-generated version."""
    if contact_id is None:
        return
    if not engagement_scorer.crosses_handoff_threshold(client_id, account_domain, db):
        return
    # Aggregate the positive triggering events for this account.
    rows = (
        db.query(EngagementEventRecord)
        .filter(
            EngagementEventRecord.client_id == client_id,
            EngagementEventRecord.account_domain == account_domain,
            EngagementEventRecord.event_type.in_([t.value for t in _HANDOFF_TRIGGER_MAP]),
        )
        .all()
    )
    triggers = [
        HandoffTriggerEvent(
            event_type=_HANDOFF_TRIGGER_MAP[EngagementEventType(r.event_type)],
            occurred_at=r.occurred_at,
            score_delta=int(r.score_delta) or 1,
        )
        for r in rows
    ]
    if not triggers:
        return
    score = engagement_scorer.account_score(client_id, account_domain, db)
    tldr = generate_tldr(client_id=client_id, account_domain=account_domain, contact_id=contact_id, db=db)
    cp4_state.create_handoff(
        client_id=client_id,
        account_domain=account_domain,
        contact_id=contact_id,
        tldr_text=tldr,
        engagement_score=score,
        triggering_events=triggers,
        db=db,
    )


def process_event(
    db: Session,
    *,
    provider: WebhookProvider,
    provider_event_id: str,
    transport: str,
    correlate_provider_message_id: Optional[str],
    event_type: EngagementEventType,
    channel: EngagementChannel,
    occurred_at: datetime,
    raw_payload: dict,
    reply_text: Optional[str] = None,
    explicit_client_id: Optional[str] = None,
    explicit_account_domain: Optional[str] = None,
    explicit_contact_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Single normalized entry point used by all three transport receivers.

    Resolves (client_id, account_domain, contact_id) by correlating against
    OutboundSendRecord via provider_message_id. Persists the engagement event,
    re-evaluates the bounce circuit breaker for EMAIL bounces, classifies any
    reply text and pauses the account on NEGATIVE (always — regardless of
    classifier source/confidence per master prompt §5), and creates a CP4
    handoff if the account crossed the engagement threshold.

    Returns a small status dict for the caller's audit log; never raises on
    correlation miss (an unmatched webhook is logged and dropped).
    """
    if explicit_client_id and explicit_account_domain:
        client_id = explicit_client_id
        account_domain = explicit_account_domain
        contact_id = explicit_contact_id
    else:
        send = correlate_send(db, transport, correlate_provider_message_id or "")
        if send is None:
            return {"status": "DROPPED", "reason": "could not correlate provider_message_id to OutboundSend"}
        client_id = send.client_id
        account_domain = send.account_domain
        contact_id = send.contact_id

    # If a bounce comes in, the matching OutboundSend status flips to FAILED
    # so the circuit breaker can see it. (Fresh sends may already be FAILED;
    # this covers the case where the transport returned SENT and the bounce
    # arrived later via webhook.)
    if event_type == EngagementEventType.EMAIL_BOUNCE and correlate_provider_message_id:
        send_row = correlate_send(db, transport, correlate_provider_message_id)
        if send_row is not None and send_row.status == SendStatus.SENT.value:
            send_row.status = SendStatus.FAILED.value
            send_row.error_code = "BOUNCE"
            send_row.completed_at = _now()
            db.add(send_row)
            db.commit()

    _record_event(
        db,
        client_id=client_id,
        account_domain=account_domain,
        contact_id=contact_id,
        channel=channel,
        event_type=event_type,
        occurred_at=occurred_at,
        provider=provider,
        provider_event_id=provider_event_id,
        raw=raw_payload,
    )

    halt = None
    if event_type == EngagementEventType.EMAIL_BOUNCE:
        halt = circuit_breaker.evaluate_bounce(client_id, db)

    classification = None
    paused = False
    if reply_text:
        classification = classify(reply_text)
        if classification.label == ReplyLabel.NEGATIVE:
            pause_account(
                db,
                client_id=client_id,
                account_domain=account_domain,
                contact_id=contact_id,
                reason="NEGATIVE_REPLY",
                detail=f"Negative reply via {provider.value} ({classification.source}, conf={classification.confidence:.2f})",
            )
            paused = True
            # Also record a REPLY_NEGATIVE event for audit/analytics. Score is 0.
            _record_event(
                db,
                client_id=client_id,
                account_domain=account_domain,
                contact_id=contact_id,
                channel=channel,
                event_type=EngagementEventType.REPLY_NEGATIVE,
                occurred_at=occurred_at,
                provider=provider,
                provider_event_id=f"{provider_event_id}:neg",
                raw={"text_hash": hash(reply_text)},
            )

    _maybe_create_handoff(db, client_id=client_id, account_domain=account_domain, contact_id=contact_id)

    return {
        "status": "PROCESSED",
        "client_id": client_id,
        "account_domain": account_domain,
        "halted": halt is not None,
        "paused": paused,
        "classification": classification.label.value if classification else None,
    }
