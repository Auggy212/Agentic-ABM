"""
Tests for the Phase 5 Campaign agent: dispatch loop, CP3 gate, transport routing,
quota manager, bounce circuit breaker, and global halt with RESUME friction.

Run: pytest backend/tests/test_campaign_agent.py -v
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.campaign import circuit_breaker, engagement_scorer
from backend.agents.campaign.agent import CampaignAgent
from backend.agents.campaign.circuit_breaker import (
    BOUNCE_MIN_SAMPLES,
    InvalidResumeTokenError,
    halt_global,
    resume,
)
from backend.agents.campaign.quota_manager import QuotaManager, QuotaSpec
from backend.agents.campaign.transport_router import TransportRouter
from backend.agents.campaign.transports.base import (
    QuotaExhaustedError,
    SendResult,
    Transport,
    TransportAuthError,
)
from backend.agents.campaign.transports.mock import (
    MockInstantly,
    MockOperatorBrief,
    MockPhantomBuster,
    MockTwilio,
)
from backend.agents.cp3.gate import CP3NotApprovedError
from backend.db.models import (
    Base,
    CampaignHaltRecord,
    CampaignRunRecord,
    CP3MessageReviewRecord,
    CP3ReviewStateRecord,
    EngagementEventRecord,
    MessageRecord,
    OutboundSendRecord,
)
from backend.schemas.models import (
    AccountTier,
    CampaignRunStatus,
    DiversityState,
    EngagementChannel,
    EngagementEventType,
    FreshnessState,
    GenerationMetadata,
    HaltReason,
    HaltScope,
    Message,
    MessageChannel,
    MessageEngine,
    MessageReviewDecision,
    MessageReviewState,
    MessageSourceType,
    PersonalizationLayer,
    PersonalizationLayers,
    SendStatus,
    TokenUsage,
    TraceabilityState,
    TransportName,
    ValidationStateBlock,
)


CLIENT_ID = "11111111-2222-3333-4444-555555555555"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _clear_mock_env():
    keys = [
        "MOCK_INSTANTLY_FAIL", "MOCK_INSTANTLY_QUOTA", "MOCK_INSTANTLY_AUTH_FAIL", "MOCK_INSTANTLY_BOUNCE",
        "MOCK_PB_FAIL", "MOCK_PB_QUOTA", "MOCK_PB_AUTH_FAIL",
        "MOCK_TWILIO_FAIL", "MOCK_TWILIO_QUOTA", "MOCK_TWILIO_AUTH_FAIL",
    ]
    for k in keys:
        os.environ.pop(k, None)
    yield
    for k in keys:
        os.environ.pop(k, None)


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------

def _layer(text: str = "x") -> PersonalizationLayer:
    return PersonalizationLayer(text=text, source_type=MessageSourceType.MASTER_CONTEXT_VALUE_PROP, untraced=False)


def _build_message(*, channel: MessageChannel = MessageChannel.EMAIL, contact_id: Optional[uuid.UUID] = None, account: str = "acme.test") -> Message:
    contact_id = contact_id or uuid.uuid4()
    if channel == MessageChannel.REDDIT_STRATEGY_NOTE:
        contact_id_val = None
    else:
        contact_id_val = contact_id
    return Message(
        message_id=uuid.uuid4(),
        client_id=uuid.UUID(CLIENT_ID),
        account_domain=account,
        contact_id=contact_id_val,
        tier=AccountTier.TIER_1,
        channel=channel,
        sequence_position=0,
        subject="Hello" if channel == MessageChannel.EMAIL else None,
        body="Body text.",
        personalization_layers=PersonalizationLayers(account_hook=_layer(), buyer_hook=_layer(), pain=_layer(), value=_layer()),
        generation_metadata=GenerationMetadata(
            engine=MessageEngine.ANTHROPIC_CLAUDE,
            model_version="claude-sonnet-test",
            prompt_template_id="tpl-test",
            generated_at=_now(),
            token_usage=TokenUsage(input_tokens=10, output_tokens=10, estimated_cost_usd=0.001),
            generation_attempt=1,
            diversity_signature="hash:test",
        ),
        validation_state=ValidationStateBlock(traceability=TraceabilityState.PASSED, diversity=DiversityState.PASSED, freshness=FreshnessState.PASSED),
        review_state=MessageReviewState.APPROVED,
        operator_edit_history=[],
        last_updated_at=_now(),
    )


def _persist_message(db, msg: Message) -> str:
    record = MessageRecord(
        id=str(msg.message_id),
        client_id=str(msg.client_id),
        account_domain=msg.account_domain,
        contact_id=str(msg.contact_id) if msg.contact_id else None,
        channel=msg.channel.value,
        sequence_position=msg.sequence_position,
        tier=msg.tier.value,
        data=msg.model_dump(mode="json"),
        validation_state=msg.validation_state.traceability.value,
        review_state=msg.review_state.value,
        last_updated_at=msg.last_updated_at,
    )
    db.add(record)
    db.commit()
    return record.id


def _seed_cp3_approved(db, *, messages: list[Message], status: str = "APPROVED") -> str:
    state = CP3ReviewStateRecord(
        id=str(uuid.uuid4()),
        client_id=CLIENT_ID,
        data={},
        status=status,
        opened_at=_now(),
        approved_at=_now() if status == "APPROVED" else None,
        reviewer="ops@x.com",
    )
    db.add(state)
    db.commit()
    for msg in messages:
        _persist_message(db, msg)
        db.add(CP3MessageReviewRecord(
            cp3_state_id=state.id,
            message_id=str(msg.message_id),
            review_decision=MessageReviewDecision.APPROVED.value,
            reviewed_at=_now(),
            opened_count=1,
        ))
    db.commit()
    return state.id


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------

def test_run_without_cp3_raises(db_session):
    agent = CampaignAgent(db_session)
    with pytest.raises(CP3NotApprovedError):
        agent.run(CLIENT_ID)


def test_run_with_cp3_in_review_state_raises(db_session):
    msg = _build_message()
    _seed_cp3_approved(db_session, messages=[msg], status="OPERATOR_REVIEW")
    agent = CampaignAgent(db_session)
    with pytest.raises(CP3NotApprovedError):
        agent.run(CLIENT_ID)


# ---------------------------------------------------------------------------
# Dispatch loop
# ---------------------------------------------------------------------------

def test_run_dispatches_only_cp3_dispatchable_decisions(db_session):
    approved = _build_message(channel=MessageChannel.EMAIL)
    pending = _build_message(channel=MessageChannel.EMAIL)
    state_id = _seed_cp3_approved(db_session, messages=[approved])
    # Add pending row not in dispatchable set.
    _persist_message(db_session, pending)
    db_session.add(CP3MessageReviewRecord(
        cp3_state_id=state_id,
        message_id=str(pending.message_id),
        review_decision=MessageReviewDecision.PENDING.value,
        opened_count=0,
    ))
    db_session.commit()

    run = CampaignAgent(db_session).run(CLIENT_ID)
    assert run.total_messages == 1
    assert run.total_sent == 1
    assert run.status == CampaignRunStatus.COMPLETED
    sends = db_session.query(OutboundSendRecord).all()
    assert len(sends) == 1
    assert sends[0].message_id == str(approved.message_id)
    assert sends[0].transport == TransportName.INSTANTLY.value
    assert sends[0].status == SendStatus.SENT.value


def test_run_routes_channels_to_correct_transports(db_session):
    email = _build_message(channel=MessageChannel.EMAIL)
    li_dm = _build_message(channel=MessageChannel.LINKEDIN_DM)
    wa = _build_message(channel=MessageChannel.WHATSAPP)
    reddit = _build_message(channel=MessageChannel.REDDIT_STRATEGY_NOTE)
    _seed_cp3_approved(db_session, messages=[email, li_dm, wa, reddit])

    CampaignAgent(db_session).run(CLIENT_ID)
    transports = {s.message_id: s.transport for s in db_session.query(OutboundSendRecord).all()}
    assert transports[str(email.message_id)] == TransportName.INSTANTLY.value
    assert transports[str(li_dm.message_id)] == TransportName.PHANTOMBUSTER.value
    assert transports[str(wa.message_id)] == TransportName.TWILIO.value
    assert transports[str(reddit.message_id)] == TransportName.OPERATOR_BRIEF.value


def test_quota_exhausted_marks_pending_no_silent_fallback(db_session):
    msg = _build_message(channel=MessageChannel.EMAIL)
    _seed_cp3_approved(db_session, messages=[msg])
    os.environ["MOCK_INSTANTLY_QUOTA"] = "1"

    run = CampaignAgent(db_session).run(CLIENT_ID)
    assert run.total_pending == 1
    assert run.total_sent == 0
    assert run.status == CampaignRunStatus.COMPLETED  # not halted; quota-pending is per-message
    assert any(w["source"] == TransportName.INSTANTLY.value for w in run.quota_warnings)
    send = db_session.query(OutboundSendRecord).first()
    assert send.status == SendStatus.PENDING_QUOTA_RESET.value


def test_transport_auth_failure_triggers_global_halt_and_stops_run(db_session):
    a = _build_message(channel=MessageChannel.EMAIL)
    b = _build_message(channel=MessageChannel.EMAIL)
    _seed_cp3_approved(db_session, messages=[a, b])
    os.environ["MOCK_INSTANTLY_AUTH_FAIL"] = "1"

    run = CampaignAgent(db_session).run(CLIENT_ID)
    assert run.status == CampaignRunStatus.HALTED
    assert "TRANSPORT_AUTH_FAILURE" in (run.halt_reason or "")
    halt = db_session.query(CampaignHaltRecord).filter_by(scope=HaltScope.GLOBAL.value, resumed_at=None).first()
    assert halt is not None
    # Only one send attempted before the halt stopped the loop.
    assert db_session.query(OutboundSendRecord).count() == 1


# ---------------------------------------------------------------------------
# Bounce circuit breaker
# ---------------------------------------------------------------------------

def _seed_email_sends(db, *, n_sent: int, n_bounced: int) -> None:
    for i in range(n_sent):
        db.add(OutboundSendRecord(
            id=str(uuid.uuid4()),
            client_id=CLIENT_ID,
            message_id=str(uuid.uuid4()),
            account_domain="acme.test",
            contact_id=str(uuid.uuid4()),
            channel=MessageChannel.EMAIL.value,
            transport=TransportName.INSTANTLY.value,
            status=SendStatus.SENT.value,
            attempted_at=_now(),
            completed_at=_now(),
        ))
    for i in range(n_bounced):
        db.add(OutboundSendRecord(
            id=str(uuid.uuid4()),
            client_id=CLIENT_ID,
            message_id=str(uuid.uuid4()),
            account_domain="acme.test",
            contact_id=str(uuid.uuid4()),
            channel=MessageChannel.EMAIL.value,
            transport=TransportName.INSTANTLY.value,
            status=SendStatus.FAILED.value,
            error_code="BOUNCE",
            attempted_at=_now(),
            completed_at=_now(),
        ))
    db.commit()


def test_bounce_breaker_does_not_trip_below_min_samples(db_session):
    # 49 samples — below floor — even 100% bounce should not trip.
    _seed_email_sends(db_session, n_sent=0, n_bounced=BOUNCE_MIN_SAMPLES - 1)
    halt = circuit_breaker.evaluate_bounce(CLIENT_ID, db_session)
    assert halt is None


def test_bounce_breaker_does_not_trip_at_or_below_threshold_rate(db_session):
    # 50 samples at 4% bounce — strictly below the 5% trigger.
    _seed_email_sends(db_session, n_sent=48, n_bounced=2)
    halt = circuit_breaker.evaluate_bounce(CLIENT_ID, db_session)
    assert halt is None


def test_bounce_breaker_trips_above_threshold(db_session):
    _seed_email_sends(db_session, n_sent=44, n_bounced=6)  # 6/50 = 12%
    halt = circuit_breaker.evaluate_bounce(CLIENT_ID, db_session)
    assert halt is not None
    assert halt.reason == HaltReason.BOUNCE_CIRCUIT_BREAKER.value
    # Idempotent — second call returns existing halt.
    again = circuit_breaker.evaluate_bounce(CLIENT_ID, db_session)
    assert again.id == halt.id


def test_run_halts_when_bounce_breaker_trips_mid_run(db_session):
    # Seed 49 prior bounces + 1 sent so we are one bounce away from tripping.
    _seed_email_sends(db_session, n_sent=1, n_bounced=49)
    msg = _build_message(channel=MessageChannel.EMAIL)
    _seed_cp3_approved(db_session, messages=[msg])
    os.environ["MOCK_INSTANTLY_BOUNCE"] = "1"

    run = CampaignAgent(db_session).run(CLIENT_ID)
    assert run.status == CampaignRunStatus.HALTED
    assert "BOUNCE_CIRCUIT_BREAKER" in (run.halt_reason or "")


def test_halted_client_blocks_subsequent_run(db_session):
    msg = _build_message(channel=MessageChannel.EMAIL)
    _seed_cp3_approved(db_session, messages=[msg])
    halt_global(reason=HaltReason.OPERATOR_REQUESTED, detail="manual halt", triggered_by="ops@x.com", db=db_session)
    with pytest.raises(circuit_breaker.CampaignHaltedError):
        CampaignAgent(db_session).run(CLIENT_ID)


# ---------------------------------------------------------------------------
# Resume friction
# ---------------------------------------------------------------------------

def test_resume_requires_exact_uppercase_token(db_session):
    halt = halt_global(reason=HaltReason.OPERATOR_REQUESTED, detail="test", triggered_by="ops", db=db_session)
    for bad in ("resume", "Resume", "RESUME ", " RESUME", "RESUMED", ""):
        with pytest.raises(InvalidResumeTokenError):
            resume(halt_id=halt.id, confirmation_token=bad, resumed_by="ops@x.com", db=db_session)


def test_resume_with_exact_token_clears_halt(db_session):
    halt = halt_global(reason=HaltReason.OPERATOR_REQUESTED, detail="test", triggered_by="ops", db=db_session)
    resumed = resume(halt_id=halt.id, confirmation_token="RESUME", resumed_by="ops@x.com", db=db_session)
    assert resumed.resumed_at is not None
    assert circuit_breaker.is_halted(CLIENT_ID, db_session) is None


def test_resume_idempotent_on_already_resumed_halt(db_session):
    halt = halt_global(reason=HaltReason.OPERATOR_REQUESTED, detail="test", triggered_by="ops", db=db_session)
    first = resume(halt_id=halt.id, confirmation_token="RESUME", resumed_by="ops@x.com", db=db_session)
    second = resume(halt_id=halt.id, confirmation_token="RESUME", resumed_by="ops@x.com", db=db_session)
    assert first.resumed_at == second.resumed_at


# ---------------------------------------------------------------------------
# Quota manager
# ---------------------------------------------------------------------------

def test_quota_manager_consumes_and_exhausts(db_session):
    qm = QuotaManager(db_session, quotas={"INSTANTLY": QuotaSpec("INSTANTLY", limit=2, window="monthly")})
    qm.check("INSTANTLY")
    qm.consume("INSTANTLY")
    qm.consume("INSTANTLY")
    with pytest.raises(QuotaExhaustedError):
        qm.check("INSTANTLY")
    assert qm.remaining("INSTANTLY") == 0


def test_quota_manager_unknown_source_is_noop(db_session):
    qm = QuotaManager(db_session, quotas={})
    qm.check("UNKNOWN")  # no raise
    qm.consume("UNKNOWN")  # no raise


# ---------------------------------------------------------------------------
# Engagement scorer
# ---------------------------------------------------------------------------

def _seed_event(db, *, event_type: EngagementEventType, account: str = "acme.test", score: int | None = None) -> None:
    db.add(EngagementEventRecord(
        client_id=CLIENT_ID,
        account_domain=account,
        contact_id=str(uuid.uuid4()),
        channel=EngagementChannel.EMAIL.value,
        event_type=event_type.value,
        score_delta=score if score is not None else engagement_scorer.score_event(event_type),
        occurred_at=_now(),
        provider="INSTANTLY",
        provider_event_id=str(uuid.uuid4()),
        data={},
    ))
    db.commit()


def test_engagement_score_table_matches_handoff_doc():
    assert engagement_scorer.score_event(EngagementEventType.EMAIL_REPLY) == 25
    assert engagement_scorer.score_event(EngagementEventType.LINKEDIN_DM_REPLY) == 25
    assert engagement_scorer.score_event(EngagementEventType.WHATSAPP_REPLY) == 30
    assert engagement_scorer.score_event(EngagementEventType.MEETING_BOOKED) == 50


def test_account_score_aggregates_events(db_session):
    _seed_event(db_session, event_type=EngagementEventType.EMAIL_REPLY)  # 25
    _seed_event(db_session, event_type=EngagementEventType.WHATSAPP_REPLY)  # 30
    assert engagement_scorer.account_score(CLIENT_ID, "acme.test", db_session) == 55
    assert engagement_scorer.crosses_handoff_threshold(CLIENT_ID, "acme.test", db_session) is False
    _seed_event(db_session, event_type=EngagementEventType.EMAIL_REPLY)  # +25 = 80
    assert engagement_scorer.crosses_handoff_threshold(CLIENT_ID, "acme.test", db_session) is True


def test_account_score_isolates_by_account(db_session):
    _seed_event(db_session, event_type=EngagementEventType.MEETING_BOOKED, account="acme.test")
    _seed_event(db_session, event_type=EngagementEventType.MEETING_BOOKED, account="other.test")
    assert engagement_scorer.account_score(CLIENT_ID, "acme.test", db_session) == 50
    assert engagement_scorer.account_score(CLIENT_ID, "other.test", db_session) == 50
