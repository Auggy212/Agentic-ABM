"""
Phase 5 end-to-end + /api/campaign operator routes.

Covers the full flow: CP3-approved messages -> /api/campaign/run dispatches
via mock transports -> incoming Instantly webhook -> engagement_scorer crosses
threshold -> handoff_generator builds TL;DR -> CP4 SalesHandoffNote created
-> Sales Exec accepts via /api/checkpoint-4 -> CP4 gate passes.

Also exercises the operator halt + RESUME-token resume cycle through HTTP.

Run: pytest backend/tests/test_phase5_e2e.py -v
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.campaign.handoff_generator import generate_tldr
from backend.agents.cp4.gate import assert_cp4_accepted
from backend.api.routes import campaign as campaign_route
from backend.api.routes import webhooks as webhooks_route
from backend.db.models import (
    Base,
    CampaignHaltRecord,
    CampaignRunRecord,
    CP3MessageReviewRecord,
    CP3ReviewStateRecord,
    EngagementEventRecord,
    MessageRecord,
    OutboundSendRecord,
    SalesHandoffRecord,
)
from backend.db.session import get_db
from backend.main import app
from backend.schemas.models import (
    AccountTier,
    CampaignRunStatus,
    DiversityState,
    EngagementChannel,
    EngagementEventType,
    FreshnessState,
    GenerationMetadata,
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
ACCOUNT = "acme.test"
INSTANTLY_SECRET = "e2e-secret"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session, SessionLocal
    finally:
        session.close()


@pytest.fixture()
def client(db):
    session, SessionLocal = db

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    webhooks_route.set_session_factory(SessionLocal)
    campaign_route.set_session_factory(SessionLocal)
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()
    webhooks_route.reset_session_factory()
    campaign_route.reset_session_factory()


@pytest.fixture(autouse=True)
def _env():
    os.environ["INSTANTLY_WEBHOOK_SECRET"] = INSTANTLY_SECRET
    os.environ["REPLY_CLASSIFIER_USE_MOCK"] = "1"
    os.environ["HANDOFF_GENERATOR_USE_MOCK"] = "1"
    yield
    for k in ("INSTANTLY_WEBHOOK_SECRET",):
        os.environ.pop(k, None)


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------

def _layer() -> PersonalizationLayer:
    return PersonalizationLayer(text="x", source_type=MessageSourceType.MASTER_CONTEXT_VALUE_PROP, untraced=False)


def _build_message(*, channel: MessageChannel = MessageChannel.EMAIL, contact_id: uuid.UUID | None = None) -> Message:
    contact_id = contact_id or uuid.uuid4()
    return Message(
        message_id=uuid.uuid4(),
        client_id=uuid.UUID(CLIENT_ID),
        account_domain=ACCOUNT,
        contact_id=contact_id if channel != MessageChannel.REDDIT_STRATEGY_NOTE else None,
        tier=AccountTier.TIER_1,
        channel=channel,
        sequence_position=0,
        subject="Hello" if channel == MessageChannel.EMAIL else None,
        body="Body.",
        personalization_layers=PersonalizationLayers(account_hook=_layer(), buyer_hook=_layer(), pain=_layer(), value=_layer()),
        generation_metadata=GenerationMetadata(
            engine=MessageEngine.ANTHROPIC_CLAUDE,
            model_version="claude-test",
            prompt_template_id="tpl",
            generated_at=_now(),
            token_usage=TokenUsage(input_tokens=1, output_tokens=1, estimated_cost_usd=0.0),
            generation_attempt=1,
            diversity_signature="hash",
        ),
        validation_state=ValidationStateBlock(traceability=TraceabilityState.PASSED, diversity=DiversityState.PASSED, freshness=FreshnessState.PASSED),
        review_state=MessageReviewState.APPROVED,
        operator_edit_history=[],
        last_updated_at=_now(),
    )


def _seed_cp3_approved(session, *, messages: list[Message]) -> str:
    state = CP3ReviewStateRecord(
        id=str(uuid.uuid4()), client_id=CLIENT_ID, data={}, status="APPROVED",
        opened_at=_now(), approved_at=_now(), reviewer="ops@x.com",
    )
    session.add(state)
    session.commit()
    for msg in messages:
        session.add(MessageRecord(
            id=str(msg.message_id), client_id=str(msg.client_id),
            account_domain=msg.account_domain,
            contact_id=str(msg.contact_id) if msg.contact_id else None,
            channel=msg.channel.value, sequence_position=msg.sequence_position,
            tier=msg.tier.value, data=msg.model_dump(mode="json"),
            validation_state=msg.validation_state.traceability.value,
            review_state=msg.review_state.value, last_updated_at=msg.last_updated_at,
        ))
        session.add(CP3MessageReviewRecord(
            cp3_state_id=state.id, message_id=str(msg.message_id),
            review_decision=MessageReviewDecision.APPROVED.value,
            reviewed_at=_now(), opened_count=1,
        ))
    session.commit()
    return state.id


def _instantly_post(client, payload: dict):
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    sig = "sha256=" + hmac.new(INSTANTLY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return client.post("/api/webhooks/instantly", content=body, headers={"X-Instantly-Signature": sig, "Content-Type": "application/json"})


# ---------------------------------------------------------------------------
# /api/campaign/run gate enforcement
# ---------------------------------------------------------------------------

def test_run_returns_423_when_cp3_not_approved(client):
    resp = client.post("/api/campaign/run", params={"client_id": CLIENT_ID})
    assert resp.status_code == 423


def test_run_returns_423_when_halt_active(client, db):
    session, _ = db
    msg = _build_message()
    _seed_cp3_approved(session, messages=[msg])
    # Pre-existing halt blocks the run.
    halt_resp = client.post("/api/campaign/halt", params={"client_id": CLIENT_ID}, json={"detail": "manual", "triggered_by": "ops"})
    assert halt_resp.status_code == 200
    resp = client.post("/api/campaign/run", params={"client_id": CLIENT_ID})
    assert resp.status_code == 423


# ---------------------------------------------------------------------------
# Resume friction (HTTP path)
# ---------------------------------------------------------------------------

def test_resume_route_rejects_lowercase_token(client, db):
    session, _ = db
    halt_resp = client.post("/api/campaign/halt", params={"client_id": CLIENT_ID}, json={"detail": "x", "triggered_by": "ops"})
    halt_id = halt_resp.json()["halt_id"]
    bad = client.post("/api/campaign/resume", json={"halt_id": halt_id, "confirmation": "resume", "resumed_by": "ops"})
    assert bad.status_code == 400


def test_resume_route_accepts_exact_token(client, db):
    halt_resp = client.post("/api/campaign/halt", params={"client_id": CLIENT_ID}, json={"detail": "x", "triggered_by": "ops"})
    halt_id = halt_resp.json()["halt_id"]
    good = client.post("/api/campaign/resume", json={"halt_id": halt_id, "confirmation": "RESUME", "resumed_by": "ops"})
    assert good.status_code == 200
    assert good.json()["is_active"] is False


def test_global_resume_rejects_client_scoped_halt(client, db):
    halt_resp = client.post("/api/campaign/halt", params={"client_id": CLIENT_ID}, json={"detail": "x", "triggered_by": "ops"})
    halt_id = halt_resp.json()["halt_id"]
    resp = client.post("/api/campaign/global-resume", json={"halt_id": halt_id, "confirmation": "RESUME", "resumed_by": "ops"})
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Quota status
# ---------------------------------------------------------------------------

def test_quota_status_returns_default_quotas(client):
    resp = client.get("/api/campaign/quota-status")
    assert resp.status_code == 200
    sources = {q["source"] for q in resp.json()["quotas"]}
    assert {"INSTANTLY", "PHANTOMBUSTER", "TWILIO", "APOLLO"}.issubset(sources)


# ---------------------------------------------------------------------------
# Handoff TL;DR generator
# ---------------------------------------------------------------------------

def test_handoff_tldr_includes_score_and_triggers(db):
    session, _ = db
    contact = str(uuid.uuid4())
    for evt in (EngagementEventType.EMAIL_REPLY, EngagementEventType.WHATSAPP_REPLY, EngagementEventType.MEETING_BOOKED):
        session.add(EngagementEventRecord(
            client_id=CLIENT_ID, account_domain=ACCOUNT, contact_id=contact,
            channel=EngagementChannel.EMAIL.value, event_type=evt.value,
            score_delta={"EMAIL_REPLY": 25, "WHATSAPP_REPLY": 30, "MEETING_BOOKED": 50}[evt.value],
            occurred_at=_now(), provider="INSTANTLY", provider_event_id=str(uuid.uuid4()), data={},
        ))
    session.commit()
    text = generate_tldr(client_id=CLIENT_ID, account_domain=ACCOUNT, contact_id=contact, db=session)
    assert "score=105" in text
    assert "email reply" in text
    assert "WhatsApp reply" in text
    assert "meeting booked" in text


# ---------------------------------------------------------------------------
# End-to-end: run -> webhook -> handoff -> CP4 accept -> gate passes
# ---------------------------------------------------------------------------

def test_full_phase5_e2e_flow(client, db):
    session, _ = db
    contact = uuid.uuid4()
    msg = _build_message(channel=MessageChannel.EMAIL, contact_id=contact)
    _seed_cp3_approved(session, messages=[msg])

    # 1. Run the campaign (background task dispatches via mock transports).
    resp = client.post("/api/campaign/run", params={"client_id": CLIENT_ID})
    assert resp.status_code == 202

    # Verify the agent created a run + at least one OutboundSend.
    run = session.query(CampaignRunRecord).filter_by(client_id=CLIENT_ID).order_by(CampaignRunRecord.started_at.desc()).first()
    assert run is not None
    assert run.status in (CampaignRunStatus.COMPLETED.value, CampaignRunStatus.RUNNING.value)
    send = session.query(OutboundSendRecord).filter_by(client_id=CLIENT_ID).first()
    assert send is not None and send.status == SendStatus.SENT.value
    provider_msg_id = send.provider_message_id

    # 2. Pre-load engagement to put the account at 50, one meeting away from threshold.
    for _ in range(2):
        session.add(EngagementEventRecord(
            client_id=CLIENT_ID, account_domain=ACCOUNT, contact_id=str(contact),
            channel=EngagementChannel.EMAIL.value, event_type=EngagementEventType.EMAIL_REPLY.value,
            score_delta=25, occurred_at=_now(), provider="INSTANTLY",
            provider_event_id=str(uuid.uuid4()), data={},
        ))
    session.commit()

    # 3. Inbound Instantly meeting_booked webhook (simulated via reply event for simplicity).
    payload = {
        "event_id": "evt-final",
        "event_type": "email_replied",
        "message_id": provider_msg_id,
        "occurred_at": _now().isoformat(),
        "reply_text": "happy to chat — let's set up a call",
    }
    wh = _instantly_post(client, payload)
    assert wh.status_code == 200

    # 4. CP4 handoff was created and TL;DR was generated.
    handoff = session.query(SalesHandoffRecord).filter_by(client_id=CLIENT_ID).first()
    assert handoff is not None
    assert handoff.engagement_score >= 60
    note = handoff.data
    assert "score=" in note["tldr_text"]
    assert "email reply" in note["tldr_text"]

    # 5. Gate is locked while PENDING.
    gate_resp = client.post("/api/checkpoint-4/gate/check", json={"handoff_id": handoff.id})
    assert gate_resp.status_code == 423

    # 6. Sales Exec notify -> accept via HTTP.
    client.post(f"/api/checkpoint-4/{handoff.id}/notify")
    accept = client.post(f"/api/checkpoint-4/{handoff.id}/accept", json={"accepted_by": "rep@x.com"})
    assert accept.status_code == 200

    # 7. Gate now passes (function-level).
    assert_cp4_accepted(handoff.id, session)
