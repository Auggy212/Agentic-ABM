"""
Tests for the Phase 5 Copilot context loader.

We do NOT call the live Groq API in tests — `get_groq_response` is monkey-patched
so the assertions cover the page-context construction and the error paths.

Run: pytest backend/tests/test_copilot_context.py -v
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.api.routes import copilot as copilot_route
from backend.api.routes.copilot import PageContext, _build_page_context
from backend.db.models import (
    Base,
    CampaignHaltRecord,
    CampaignRunRecord,
    CP3ReviewStateRecord,
    SalesHandoffRecord,
)
from backend.db.session import get_db
from backend.main import app


CLIENT_ID = "11111111-2222-3333-4444-555555555555"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


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


@pytest.fixture()
def client(db_session):
    def override():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Page-context loader (pure function)
# ---------------------------------------------------------------------------

def test_page_context_route_only_has_no_client_state(db_session):
    ctx = _build_page_context(db_session, PageContext(route="/accounts"))
    assert ctx["route"] == "/accounts"
    assert "cp3_status" not in ctx
    assert "campaign_halt" not in ctx


def test_page_context_loads_cp3_status_when_client_id_present(db_session):
    db_session.add(CP3ReviewStateRecord(
        client_id=CLIENT_ID, data={}, status="OPERATOR_REVIEW", opened_at=_now(), reviewer="ops",
    ))
    db_session.commit()
    ctx = _build_page_context(db_session, PageContext(route="/checkpoint-3", client_id=CLIENT_ID))
    assert ctx["cp3_status"] == "OPERATOR_REVIEW"


def test_page_context_loads_active_halt_and_latest_run(db_session):
    db_session.add(CampaignHaltRecord(
        id=str(uuid.uuid4()), client_id=CLIENT_ID, scope="CLIENT",
        reason="OPERATOR_REQUESTED", detail="testing", triggered_at=_now(), triggered_by="ops",
    ))
    db_session.add(CampaignRunRecord(
        id=str(uuid.uuid4()), client_id=CLIENT_ID, status="HALTED",
        started_at=_now(), total_messages=5, total_sent=2, total_failed=1, total_pending=2,
        halted=True, halt_reason="OPERATOR_REQUESTED",
    ))
    db_session.commit()
    ctx = _build_page_context(db_session, PageContext(route="/campaigns", client_id=CLIENT_ID))
    assert ctx["campaign_halt"]["scope"] == "CLIENT"
    assert ctx["latest_run"]["status"] == "HALTED"
    assert ctx["latest_run"]["sent"] == 2


def test_page_context_global_halt_visible_for_any_client(db_session):
    other_client = "99999999-9999-9999-9999-999999999999"
    db_session.add(CampaignHaltRecord(
        id=str(uuid.uuid4()), client_id=None, scope="GLOBAL",
        reason="TRANSPORT_AUTH_FAILURE", detail="instantly down", triggered_at=_now(), triggered_by="system",
    ))
    db_session.commit()
    ctx = _build_page_context(db_session, PageContext(route="/campaigns", client_id=other_client))
    assert ctx["campaign_halt"]["scope"] == "GLOBAL"


def test_page_context_counts_pending_handoffs(db_session):
    db_session.add(SalesHandoffRecord(
        id=str(uuid.uuid4()), client_id=CLIENT_ID, account_domain="acme.test",
        contact_id=str(uuid.uuid4()), data={}, status="PENDING", engagement_score=80,
    ))
    db_session.add(SalesHandoffRecord(
        id=str(uuid.uuid4()), client_id=CLIENT_ID, account_domain="globex.test",
        contact_id=str(uuid.uuid4()), data={}, status="ACCEPTED", engagement_score=90,
    ))
    db_session.commit()
    ctx = _build_page_context(db_session, PageContext(route="/checkpoint-4", client_id=CLIENT_ID))
    assert ctx["cp4_pending_handoffs"] == 1


def test_page_context_handles_missing_page(db_session):
    ctx = _build_page_context(db_session, None)
    assert ctx["route"] is None
    assert ctx["accounts_active"] == 0


# ---------------------------------------------------------------------------
# /message endpoint — system prompt is built and sent to (mocked) Groq
# ---------------------------------------------------------------------------

def test_message_returns_503_when_api_key_missing(client, monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    resp = client.post("/api/copilot/message", json={
        "message": "hi",
        "page": {"route": "/checkpoint-3", "client_id": CLIENT_ID},
    })
    assert resp.status_code == 503
    assert "GROQ_API_KEY" in resp.json()["detail"]


def test_message_passes_route_hint_into_system_prompt(client, db_session, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    db_session.add(CP3ReviewStateRecord(
        client_id=CLIENT_ID, data={}, status="OPERATOR_REVIEW", opened_at=_now(), reviewer="ops",
    ))
    db_session.commit()

    captured = {}

    class _Msg:
        def __init__(self, content):
            self.content = content
            self.tool_calls = None

    class FakeGroqClient:
        def chat_message(self, *, messages, model, temperature, max_tokens, tools=None, tool_choice=None):
            captured["messages"] = messages
            captured["model"] = model
            return _Msg("Open the next PENDING message.")

    monkeypatch.setattr("backend.services.groq_client.GroqClient", lambda: FakeGroqClient())

    resp = client.post("/api/copilot/message", json={
        "message": "where do I start?",
        "page": {"route": "/checkpoint-3", "client_id": CLIENT_ID},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "Open the next PENDING message."

    # Verify the system prompt actually carried the route + CP3 status.
    system = captured["messages"][0]["content"]
    assert "/checkpoint-3" in system
    assert "OPERATOR_REVIEW" in system
    assert "Route hint" in system  # CP3-specific hint was inserted
    assert captured["model"] == "llama-3.3-70b-versatile"

    # Trace surfaces the loaded context, not just the legacy phrases.
    trace_texts = " ".join(t["text"] for t in body["trace"])
    assert "/checkpoint-3" in trace_texts
    assert "OPERATOR_REVIEW" in trace_texts


def test_message_validation_rejects_empty_string(client):
    resp = client.post("/api/copilot/message", json={"message": "", "page": {"route": "/x"}})
    assert resp.status_code == 422
