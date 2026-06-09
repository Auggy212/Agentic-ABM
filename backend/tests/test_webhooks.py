"""
Tests for the Phase 5 webhook receivers and the shared webhook_processors.

Run: pytest backend/tests/test_webhooks.py -v
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.campaign import webhook_processors
from backend.agents.campaign.reply_classifier import ReplyLabel, classify, regex_classify
from backend.api.routes import webhooks as webhooks_route
from backend.db.models import (
    AccountPauseRecord,
    Base,
    CampaignHaltRecord,
    EngagementEventRecord,
    OutboundSendRecord,
    SalesHandoffRecord,
    WebhookReceiptRecord,
)
from backend.db.session import get_db
from backend.main import app
from backend.schemas.models import (
    EngagementChannel,
    EngagementEventType,
    HaltReason,
    HaltScope,
    MessageChannel,
    SendStatus,
    TransportName,
    WebhookProvider,
)


CLIENT_ID = "11111111-2222-3333-4444-555555555555"
ACCOUNT = "acme.test"
INSTANTLY_SECRET = "instantly-test-secret"
PB_SECRET = "pb-test-secret"
TWILIO_TOKEN = "twilio-test-token"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session, SessionLocal
    finally:
        session.close()


@pytest.fixture()
def client(db_session):
    session, SessionLocal = db_session

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    webhooks_route.set_session_factory(SessionLocal)
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()
    webhooks_route.reset_session_factory()


@pytest.fixture(autouse=True)
def _set_secrets():
    os.environ["INSTANTLY_WEBHOOK_SECRET"] = INSTANTLY_SECRET
    os.environ["PHANTOMBUSTER_WEBHOOK_SECRET"] = PB_SECRET
    os.environ["TWILIO_AUTH_TOKEN"] = TWILIO_TOKEN
    os.environ["REPLY_CLASSIFIER_USE_MOCK"] = "1"
    yield
    for k in ("INSTANTLY_WEBHOOK_SECRET", "PHANTOMBUSTER_WEBHOOK_SECRET", "TWILIO_AUTH_TOKEN"):
        os.environ.pop(k, None)


def _seed_send(session, *, transport=TransportName.INSTANTLY.value, channel=MessageChannel.EMAIL.value, provider_message_id="prov-msg-1", account=ACCOUNT, contact_id=None) -> OutboundSendRecord:
    contact_id = contact_id or str(uuid.uuid4())
    record = OutboundSendRecord(
        id=str(uuid.uuid4()),
        client_id=CLIENT_ID,
        message_id=str(uuid.uuid4()),
        account_domain=account,
        contact_id=contact_id,
        channel=channel,
        transport=transport,
        status=SendStatus.SENT.value,
        provider_message_id=provider_message_id,
        attempted_at=_now(),
        completed_at=_now(),
    )
    session.add(record)
    session.commit()
    return record


def _instantly_sig(body: bytes) -> str:
    return "sha256=" + hmac.new(INSTANTLY_SECRET.encode(), body, hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------

def test_instantly_signature_required(client):
    resp = client.post("/api/webhooks/instantly", json={"event_id": "x", "event_type": "email_opened"})
    assert resp.status_code == 401


def test_instantly_signature_wrong_rejected(client):
    body = b'{"event_id":"x","event_type":"email_opened"}'
    resp = client.post(
        "/api/webhooks/instantly",
        content=body,
        headers={"X-Instantly-Signature": "sha256=deadbeef", "Content-Type": "application/json"},
    )
    assert resp.status_code == 401


def test_phantombuster_signature_required(client):
    resp = client.post("/api/webhooks/phantombuster", json={"event_id": "x", "event_type": "dm_reply"})
    assert resp.status_code == 401


def test_phantombuster_signature_wrong_rejected(client):
    resp = client.post(
        "/api/webhooks/phantombuster",
        json={"event_id": "x", "event_type": "dm_reply"},
        headers={"X-PB-Signature": "wrong"},
    )
    assert resp.status_code == 401


def test_twilio_signature_required(client):
    resp = client.post("/api/webhooks/twilio", data={"MessageSid": "SM1", "Body": "hi"})
    assert resp.status_code == 401


def test_twilio_signature_correct_accepted(client, db_session):
    session, _ = db_session
    _seed_send(session, transport=TransportName.TWILIO.value, channel=MessageChannel.WHATSAPP.value, provider_message_id="SM_orig")
    params = {"MessageSid": "SM_inbound", "OriginalMessageSid": "SM_orig", "Body": "thanks for reaching out"}
    url = "http://testserver/api/webhooks/twilio"
    payload_str = url + "".join(k + params[k] for k in sorted(params.keys()))
    sig = base64.b64encode(hmac.new(TWILIO_TOKEN.encode(), payload_str.encode(), hashlib.sha1).digest()).decode()
    resp = client.post("/api/webhooks/twilio", data=params, headers={"X-Twilio-Signature": sig})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Idempotent replay
# ---------------------------------------------------------------------------

def test_instantly_duplicate_event_short_circuits(client, db_session):
    session, _ = db_session
    _seed_send(session, provider_message_id="msg-1")
    payload = {"event_id": "evt-1", "event_type": "email_opened", "message_id": "msg-1", "occurred_at": _now().isoformat()}
    body = _json_bytes(payload)
    sig = _instantly_sig(body)
    headers = {"X-Instantly-Signature": sig, "Content-Type": "application/json"}
    first = client.post("/api/webhooks/instantly", content=body, headers=headers)
    second = client.post("/api/webhooks/instantly", content=body, headers=headers)
    assert first.status_code == 200 and first.json()["status"] == "accepted"
    assert second.status_code == 200 and second.json()["status"] == "duplicate"
    assert session.query(WebhookReceiptRecord).count() == 1


# ---------------------------------------------------------------------------
# End-to-end: webhook -> processor side effects
# ---------------------------------------------------------------------------

def test_instantly_email_reply_triggers_handoff_when_threshold_crossed(client, db_session):
    session, _ = db_session
    send = _seed_send(session, provider_message_id="msg-1")
    # Pre-seed enough engagement to put this account at score 50 (one short of the 60 trigger).
    for _ in range(2):
        session.add(EngagementEventRecord(
            client_id=CLIENT_ID,
            account_domain=ACCOUNT,
            contact_id=send.contact_id,
            channel=EngagementChannel.EMAIL.value,
            event_type=EngagementEventType.EMAIL_REPLY.value,
            score_delta=25,
            occurred_at=_now(),
            provider="INSTANTLY",
            provider_event_id=str(uuid.uuid4()),
            data={},
        ))
    session.commit()

    payload = {"event_id": "evt-2", "event_type": "email_replied", "message_id": "msg-1", "occurred_at": _now().isoformat(), "reply_text": "happy to chat"}
    body = _json_bytes(payload)
    resp = client.post("/api/webhooks/instantly", content=body, headers={"X-Instantly-Signature": _instantly_sig(body), "Content-Type": "application/json"})
    assert resp.status_code == 200
    handoffs = session.query(SalesHandoffRecord).filter_by(client_id=CLIENT_ID).all()
    assert len(handoffs) == 1
    assert handoffs[0].engagement_score >= 60


def test_negative_reply_pauses_account_unconditionally(client, db_session):
    session, _ = db_session
    send = _seed_send(session, provider_message_id="msg-neg")
    payload = {"event_id": "evt-neg", "event_type": "email_replied", "message_id": "msg-neg", "occurred_at": _now().isoformat(), "reply_text": "please unsubscribe me"}
    body = _json_bytes(payload)
    resp = client.post("/api/webhooks/instantly", content=body, headers={"X-Instantly-Signature": _instantly_sig(body), "Content-Type": "application/json"})
    assert resp.status_code == 200
    pause = session.query(AccountPauseRecord).filter_by(client_id=CLIENT_ID, account_domain=ACCOUNT, resumed_at=None).first()
    assert pause is not None
    assert pause.reason == "NEGATIVE_REPLY"
    assert webhook_processors.is_account_paused(session, client_id=CLIENT_ID, account_domain=ACCOUNT)


def test_unknown_provider_message_id_is_dropped(client, db_session):
    session, _ = db_session
    payload = {"event_id": "evt-orphan", "event_type": "email_opened", "message_id": "no-such-msg", "occurred_at": _now().isoformat()}
    body = _json_bytes(payload)
    resp = client.post("/api/webhooks/instantly", content=body, headers={"X-Instantly-Signature": _instantly_sig(body), "Content-Type": "application/json"})
    assert resp.status_code == 200
    assert session.query(EngagementEventRecord).count() == 0
    # Receipt was still recorded (replay protection).
    assert session.query(WebhookReceiptRecord).count() == 1


def test_email_bounce_flips_send_status_and_can_trip_breaker(client, db_session):
    session, _ = db_session
    # 49 prior bounces + 1 send still SENT — one more bounce trips the breaker.
    for _ in range(49):
        session.add(OutboundSendRecord(
            id=str(uuid.uuid4()), client_id=CLIENT_ID, message_id=str(uuid.uuid4()),
            account_domain=ACCOUNT, contact_id=str(uuid.uuid4()),
            channel=MessageChannel.EMAIL.value, transport=TransportName.INSTANTLY.value,
            status=SendStatus.FAILED.value, error_code="BOUNCE",
            attempted_at=_now(), completed_at=_now(),
        ))
    send = _seed_send(session, provider_message_id="msg-bounce")
    session.commit()

    payload = {"event_id": "evt-b", "event_type": "email_bounced", "message_id": "msg-bounce", "occurred_at": _now().isoformat()}
    body = _json_bytes(payload)
    resp = client.post("/api/webhooks/instantly", content=body, headers={"X-Instantly-Signature": _instantly_sig(body), "Content-Type": "application/json"})
    assert resp.status_code == 200
    refreshed = session.query(OutboundSendRecord).filter_by(id=send.id).first()
    assert refreshed.status == SendStatus.FAILED.value
    halt = session.query(CampaignHaltRecord).filter_by(scope=HaltScope.CLIENT.value, resumed_at=None).first()
    assert halt is not None
    assert halt.reason == HaltReason.BOUNCE_CIRCUIT_BREAKER.value


# ---------------------------------------------------------------------------
# Reply classifier (pure unit)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("please unsubscribe", ReplyLabel.NEGATIVE),
    ("STOP", ReplyLabel.NEGATIVE),
    ("not interested, thanks", ReplyLabel.NEGATIVE),
    ("can we book a call next week?", ReplyLabel.MEETING_REQUEST),
    ("happy to chat", ReplyLabel.POSITIVE),
    ("interested in learning more", ReplyLabel.POSITIVE),
    ("how does pricing work?", ReplyLabel.QUESTION),
    ("ok", ReplyLabel.NEUTRAL),
])
def test_regex_classifier_labels(text, expected):
    assert regex_classify(text).label is expected


def test_classifier_negative_takes_precedence_over_meeting():
    # A reply that *mentions* a calendar but is fundamentally a refusal must
    # still be classified NEGATIVE so the contact is paused.
    out = regex_classify("not interested, do not put me on your calendly")
    assert out.label is ReplyLabel.NEGATIVE


def test_classify_uses_cache_on_repeat():
    text = "interested in learning more"
    a = classify(text)
    b = classify(text)
    assert a == b


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_bytes(payload: dict) -> bytes:
    import json
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
