"""
Tests for the Phase 5 / Checkpoint 4 (Sales Handoff) gate, state manager,
invariants, and HTTP routes.

Run: pytest backend/tests/test_cp4_state_manager.py -v
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.cp4 import state_manager
from backend.agents.cp4.gate import CP4NotAcceptedError, assert_cp4_accepted
from backend.agents.cp4.invariants import SLA_HOURS, is_overdue
from backend.agents.cp4.state_manager import CP4NotFoundError, CP4StateError
from backend.db.models import Base, CP4AuditLogRecord, EventRecord, SalesHandoffRecord
from backend.db.session import get_db
from backend.main import app
from backend.schemas.models import (
    CP4Status,
    HandoffTriggerEvent,
    HandoffTriggerEventType,
    SalesHandoffNote,
)


CLIENT_ID = "11111111-2222-3333-4444-555555555555"
ACCOUNT = "acme.example"
CONTACT_ID = "22222222-3333-4444-5555-666666666666"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def test_client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def _trigger_event(score: int = 30, event_type: HandoffTriggerEventType = HandoffTriggerEventType.WHATSAPP_REPLY) -> HandoffTriggerEvent:
    return HandoffTriggerEvent(event_type=event_type, occurred_at=_now(), score_delta=score)


def _create(db, *, contact_id: str = CONTACT_ID, score: int = 60) -> SalesHandoffNote:
    return state_manager.create_handoff(
        client_id=CLIENT_ID,
        account_domain=ACCOUNT,
        contact_id=contact_id,
        tldr_text="Champion replied positively on WhatsApp; meeting requested.",
        engagement_score=score,
        triggering_events=[_trigger_event()],
        db=db,
    )


# ---------------------------------------------------------------------------
# Schema invariants
# ---------------------------------------------------------------------------

def _base_kwargs(**overrides):
    base = dict(
        handoff_id=uuid.uuid4(),
        client_id=uuid.UUID(CLIENT_ID),
        account_domain=ACCOUNT,
        contact_id=uuid.UUID(CONTACT_ID),
        tldr_text="x",
        engagement_score=60,
        triggering_events=[_trigger_event()],
        status=CP4Status.PENDING,
        created_at=_now(),
        notify_sent_at=None,
        accepted_at=None,
        accepted_by=None,
        escalated_at=None,
        escalation_reason=None,
        rejected_at=None,
        rejection_reason=None,
    )
    base.update(overrides)
    return base


def test_schema_pending_minimal_is_valid():
    note = SalesHandoffNote(**_base_kwargs())
    assert note.status == CP4Status.PENDING


def test_schema_accepted_requires_accepted_at_and_by():
    with pytest.raises(ValueError):
        SalesHandoffNote(**_base_kwargs(status=CP4Status.ACCEPTED, accepted_at=_now()))


def test_schema_accepted_with_extra_terminal_fields_rejected():
    with pytest.raises(ValueError):
        SalesHandoffNote(**_base_kwargs(
            status=CP4Status.ACCEPTED,
            accepted_at=_now(),
            accepted_by="rep@x.com",
            rejected_at=_now(),
        ))


def test_schema_rejected_requires_reason():
    with pytest.raises(ValueError):
        SalesHandoffNote(**_base_kwargs(status=CP4Status.REJECTED, rejected_at=_now()))


def test_schema_escalated_requires_prior_notify():
    with pytest.raises(ValueError):
        SalesHandoffNote(**_base_kwargs(
            status=CP4Status.ESCALATED,
            escalated_at=_now(),
            escalation_reason="missed SLA",
            notify_sent_at=None,
        ))


def test_schema_pending_cannot_carry_terminal_timestamps():
    with pytest.raises(ValueError):
        SalesHandoffNote(**_base_kwargs(accepted_at=_now()))


# ---------------------------------------------------------------------------
# State manager
# ---------------------------------------------------------------------------

def test_create_handoff_persists_pending(db_session):
    note = _create(db_session)
    assert note.status == CP4Status.PENDING
    assert note.engagement_score == 60
    assert db_session.query(SalesHandoffRecord).count() == 1
    audits = db_session.query(CP4AuditLogRecord).filter_by(action="CREATE").all()
    assert len(audits) == 1


def test_create_handoff_is_idempotent_on_pending_triple(db_session):
    first = _create(db_session)
    second = _create(db_session)
    assert first.handoff_id == second.handoff_id
    assert db_session.query(SalesHandoffRecord).count() == 1


def test_create_handoff_after_rejection_creates_new_row(db_session):
    first = _create(db_session)
    state_manager.notify_sales_exec(str(first.handoff_id), db_session)
    state_manager.reject_handoff(str(first.handoff_id), "not a fit", "rep@x.com", db_session)
    second = _create(db_session)
    assert first.handoff_id != second.handoff_id
    assert db_session.query(SalesHandoffRecord).count() == 2


def test_notify_sets_timestamp_once_then_noops(db_session):
    note = _create(db_session)
    notified = state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    assert notified.notify_sent_at is not None
    first_ts = notified.notify_sent_at
    again = state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    assert again.notify_sent_at == first_ts


def test_accept_requires_prior_notification(db_session):
    note = _create(db_session)
    with pytest.raises(CP4StateError, match="notified"):
        state_manager.accept_handoff(str(note.handoff_id), "rep@x.com", db_session)


def test_accept_transitions_to_accepted_and_emits_event(db_session):
    note = _create(db_session)
    state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    accepted = state_manager.accept_handoff(str(note.handoff_id), "rep@x.com", db_session)
    assert accepted.status == CP4Status.ACCEPTED
    assert accepted.accepted_by == "rep@x.com"
    assert db_session.query(EventRecord).filter_by(event_type="cp4.accepted").count() == 1


def test_reject_requires_reason(db_session):
    note = _create(db_session)
    state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    with pytest.raises(CP4StateError, match="rejection_reason"):
        state_manager.reject_handoff(str(note.handoff_id), "  ", "rep@x.com", db_session)


def test_double_accept_blocked(db_session):
    note = _create(db_session)
    state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    state_manager.accept_handoff(str(note.handoff_id), "rep@x.com", db_session)
    with pytest.raises(CP4StateError, match="PENDING"):
        state_manager.accept_handoff(str(note.handoff_id), "rep2@x.com", db_session)


def test_get_handoff_unknown_raises(db_session):
    with pytest.raises(CP4NotFoundError):
        state_manager.get_handoff(str(uuid.uuid4()), db_session)


# ---------------------------------------------------------------------------
# Escalation sweep
# ---------------------------------------------------------------------------

def test_is_overdue_only_after_sla(db_session):
    note = _create(db_session)
    notified = state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    just_before = notified.notify_sent_at + timedelta(hours=SLA_HOURS - 1)
    just_after = notified.notify_sent_at + timedelta(hours=SLA_HOURS + 1)
    assert is_overdue(notified, now=just_before) is False
    assert is_overdue(notified, now=just_after) is True


def test_escalate_overdue_skips_fresh_pending(db_session):
    note = _create(db_session)
    state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    escalated = state_manager.escalate_overdue(CLIENT_ID, db_session)
    assert escalated == []


def test_escalate_overdue_marks_stale_pending(db_session):
    note = _create(db_session)
    notified = state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    sweep_time = notified.notify_sent_at + timedelta(hours=SLA_HOURS + 1)
    escalated = state_manager.escalate_overdue(CLIENT_ID, db_session, now=sweep_time)
    assert len(escalated) == 1
    assert escalated[0].status == CP4Status.ESCALATED
    assert escalated[0].escalation_reason
    # Idempotent: re-running does nothing.
    again = state_manager.escalate_overdue(CLIENT_ID, db_session, now=sweep_time)
    assert again == []
    assert db_session.query(EventRecord).filter_by(event_type="cp4.escalated").count() == 1


def test_escalate_does_not_touch_unnotified(db_session):
    _create(db_session)  # never notified
    sweep_time = _now() + timedelta(days=7)
    escalated = state_manager.escalate_overdue(CLIENT_ID, db_session, now=sweep_time)
    assert escalated == []


def test_summary_counts(db_session):
    a = _create(db_session, contact_id=str(uuid.uuid4()))
    b = _create(db_session, contact_id=str(uuid.uuid4()))
    state_manager.notify_sales_exec(str(a.handoff_id), db_session)
    state_manager.accept_handoff(str(a.handoff_id), "rep@x.com", db_session)
    state_manager.notify_sales_exec(str(b.handoff_id), db_session)
    overview = state_manager.summary(CLIENT_ID, db_session)
    assert overview.total == 2
    assert overview.accepted == 1
    assert overview.pending == 1


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------

def test_gate_raises_for_missing_handoff(db_session):
    with pytest.raises(CP4NotAcceptedError, match="does not exist"):
        assert_cp4_accepted(str(uuid.uuid4()), db_session)


def test_gate_raises_for_pending_handoff(db_session):
    note = _create(db_session)
    with pytest.raises(CP4NotAcceptedError, match="not ACCEPTED"):
        assert_cp4_accepted(str(note.handoff_id), db_session)


def test_gate_passes_for_accepted_handoff(db_session):
    note = _create(db_session)
    state_manager.notify_sales_exec(str(note.handoff_id), db_session)
    state_manager.accept_handoff(str(note.handoff_id), "rep@x.com", db_session)
    assert_cp4_accepted(str(note.handoff_id), db_session)  # no raise


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------

def test_route_get_lists_handoffs(test_client, db_session):
    _create(db_session)
    response = test_client.get("/api/checkpoint-4", params={"client_id": CLIENT_ID})
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["total"] == 1
    assert len(payload["handoffs"]) == 1


def test_route_accept_then_gate_check_passes(test_client, db_session):
    note = _create(db_session)
    test_client.post(f"/api/checkpoint-4/{note.handoff_id}/notify")
    accept_resp = test_client.post(
        f"/api/checkpoint-4/{note.handoff_id}/accept",
        json={"accepted_by": "rep@x.com"},
    )
    assert accept_resp.status_code == 200
    gate_resp = test_client.post("/api/checkpoint-4/gate/check", json={"handoff_id": str(note.handoff_id)})
    assert gate_resp.status_code == 200
    assert gate_resp.json() == {"status": "ACCEPTED"}


def test_route_accept_without_notify_returns_409(test_client, db_session):
    note = _create(db_session)
    resp = test_client.post(
        f"/api/checkpoint-4/{note.handoff_id}/accept",
        json={"accepted_by": "rep@x.com"},
    )
    assert resp.status_code == 409


def test_route_gate_check_pending_returns_423(test_client, db_session):
    note = _create(db_session)
    resp = test_client.post("/api/checkpoint-4/gate/check", json={"handoff_id": str(note.handoff_id)})
    assert resp.status_code == 423


def test_route_gate_check_unknown_returns_423(test_client):
    resp = test_client.post("/api/checkpoint-4/gate/check", json={"handoff_id": str(uuid.uuid4())})
    assert resp.status_code == 423


def test_route_reject_requires_reason(test_client, db_session):
    note = _create(db_session)
    test_client.post(f"/api/checkpoint-4/{note.handoff_id}/notify")
    resp = test_client.post(
        f"/api/checkpoint-4/{note.handoff_id}/reject",
        json={"rejection_reason": "", "rejected_by": "rep@x.com"},
    )
    # Empty string fails Pydantic min_length=1 -> 422 from FastAPI
    assert resp.status_code == 422


def test_route_get_unknown_returns_404(test_client):
    resp = test_client.get(f"/api/checkpoint-4/{uuid.uuid4()}")
    assert resp.status_code == 404
