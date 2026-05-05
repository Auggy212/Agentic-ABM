"""
Tests for the Phase 5 Copilot tool registry, tool-use loop, and the
action-execution endpoint with confirmation friction.

Run: pytest backend/tests/test_copilot_tools.py -v
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.copilot.tools import (
    REGISTRY,
    build_proposed_action,
    execute_read_only,
    get_tool,
    tool_schemas,
)
from backend.agents.cp4 import state_manager as cp4_state
from backend.db.models import (
    Base,
    CampaignHaltRecord,
    CP3MessageReviewRecord,
    CP3ReviewStateRecord,
    QuotaCounterRecord,
    SalesHandoffRecord,
)
from backend.db.session import get_db
from backend.main import app
from backend.schemas.models import HandoffTriggerEvent, HandoffTriggerEventType


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
def client(db_session, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    def override():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tool registry shape
# ---------------------------------------------------------------------------

def test_registry_has_both_permission_tiers():
    perms = {t.permission for t in REGISTRY}
    assert "read_only" in perms
    assert "proposed_action" in perms


def test_tool_schemas_match_openai_function_shape():
    for schema in tool_schemas():
        assert schema["type"] == "function"
        assert "name" in schema["function"]
        assert "parameters" in schema["function"]
        assert schema["function"]["parameters"]["type"] == "object"


def test_destructive_tools_carry_typed_confirm_token():
    accept = get_tool("accept_handoff")
    halt = get_tool("halt_campaign")
    assert accept.confirm_token == "ACCEPT"
    assert halt.confirm_token == "HALT"
    # Safe ones require only a simple click-confirm.
    nav = get_tool("navigate")
    assert nav.confirm_token is None


# ---------------------------------------------------------------------------
# read_only handlers
# ---------------------------------------------------------------------------

def test_get_quota_status_executes_against_db(db_session):
    db_session.add(QuotaCounterRecord(source="INSTANTLY", window="202605", used=5, limit_value=100))
    db_session.commit()
    result = execute_read_only(get_tool("get_quota_status"), db_session, {})
    assert result["quotas"][0]["source"] == "INSTANTLY"
    assert result["quotas"][0]["used"] == 5


def test_list_pending_messages_filters_by_client(db_session):
    state = CP3ReviewStateRecord(
        id=str(uuid.uuid4()), client_id=CLIENT_ID, data={}, status="OPERATOR_REVIEW",
        opened_at=_now(), reviewer="ops",
    )
    db_session.add(state); db_session.commit()
    db_session.add_all([
        CP3MessageReviewRecord(cp3_state_id=state.id, message_id="m-1", review_decision="PENDING", opened_count=0),
        CP3MessageReviewRecord(cp3_state_id=state.id, message_id="m-2", review_decision="PENDING", opened_count=1),
        CP3MessageReviewRecord(cp3_state_id=state.id, message_id="m-3", review_decision="APPROVED", opened_count=1),
    ])
    db_session.commit()
    result = execute_read_only(get_tool("list_pending_messages"), db_session, {"client_id": CLIENT_ID})
    assert result["pending_count"] == 2
    assert sorted(result["first_20_ids"]) == ["m-1", "m-2"]


def test_read_only_filters_unknown_args(db_session):
    """Model invents an arg → should be silently dropped, not exception."""
    db_session.add(QuotaCounterRecord(source="X", window="w", used=0, limit_value=1))
    db_session.commit()
    result = execute_read_only(
        get_tool("get_quota_status"), db_session, {"intruder": "drop me"},
    )
    assert "quotas" in result


# ---------------------------------------------------------------------------
# Proposed actions
# ---------------------------------------------------------------------------

def test_build_proposed_action_renders_consequence_template():
    nav = get_tool("navigate")
    payload = build_proposed_action(nav, {"path": "/checkpoint-3"})
    assert payload["tool"] == "navigate"
    assert payload["args"] == {"path": "/checkpoint-3"}
    assert "/checkpoint-3" in payload["consequence"]
    assert payload["confirm_token"] is None


def test_build_proposed_action_strips_unknown_args():
    halt = get_tool("halt_campaign")
    payload = build_proposed_action(halt, {"client_id": CLIENT_ID, "detail": "x", "extra": "evil"})
    assert "extra" not in payload["args"]
    assert payload["confirm_token"] == "HALT"


# ---------------------------------------------------------------------------
# Tool-use loop — fake Groq client returns scripted tool_calls
# ---------------------------------------------------------------------------

def _msg(content="", tool_calls=None):
    class _M:
        pass
    m = _M()
    m.content = content
    m.tool_calls = tool_calls
    return m


def _tool_call(call_id, name, args):
    class _F:
        def __init__(self, n, a):
            self.name = n
            self.arguments = json.dumps(a)
    class _TC:
        def __init__(self, i, f):
            self.id = i
            self.function = f
    return _TC(call_id, _F(name, args))


def test_message_executes_read_only_tool_and_feeds_result_back(client, db_session, monkeypatch):
    state = CP3ReviewStateRecord(
        id=str(uuid.uuid4()), client_id=CLIENT_ID, data={"blockers": [{"type": "X", "message": "y"}]},
        status="CHANGES_REQUESTED", opened_at=_now(), reviewer="ops",
    )
    db_session.add(state); db_session.commit()

    calls = []

    class FakeClient:
        def __init__(self):
            self.turn = 0

        def chat_message(self, *, messages, model, temperature, max_tokens, tools=None, tool_choice=None):
            calls.append({"turn": self.turn, "msg_count": len(messages), "tool_choice": tool_choice})
            self.turn += 1
            if self.turn == 1:
                # First turn: ask for the read-only tool.
                return _msg(tool_calls=[_tool_call("call-1", "get_cp3_blockers", {"client_id": CLIENT_ID})])
            # Second turn: model now sees the tool result and answers in text.
            return _msg(content="The CP3 blockers are: X — y")

    monkeypatch.setattr("backend.services.groq_client.GroqClient", lambda: FakeClient())

    resp = client.post("/api/copilot/message", json={
        "message": "what's blocking CP3?",
        "page": {"route": "/checkpoint-3", "client_id": CLIENT_ID},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "X" in body["text"]
    # Exactly two model calls (loop ran twice).
    assert len(calls) == 2
    # Trace records the tool execution.
    assert any("get_cp3_blockers" in t["text"] for t in body["trace"])
    # No proposed actions for a pure read-only response.
    assert body["proposed_actions"] == []


def test_loop_recovers_when_groq_returns_tool_use_failed(client, monkeypatch):
    """Mid-loop Groq 400 (e.g. malformed tool call) should not crash the
    request. The route falls back to a no-tools call so the user still gets
    a textual reply."""
    seen_tools = []

    class FakeClient:
        def __init__(self):
            self.turn = 0

        def chat_message(self, *, messages, model, temperature, max_tokens, tools=None, tool_choice=None):
            seen_tools.append(tools)
            self.turn += 1
            if self.turn == 1:
                # Simulate Groq's tool_use_failed.
                raise RuntimeError("Groq API error: 400 tool_use_failed")
            return _msg(content="Here's the info you asked for.")

    monkeypatch.setattr("backend.services.groq_client.GroqClient", lambda: FakeClient())
    resp = client.post("/api/copilot/message", json={
        "message": "anything", "page": {"route": "/checkpoint-3", "client_id": CLIENT_ID},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "Here's the info" in body["text"]
    # First call had tools, retry call did not.
    assert seen_tools[0] is not None and seen_tools[1] is None


def test_proposed_action_final_turn_omits_tools(client, monkeypatch):
    """After we propose an action, the final 'phrase the proposal' turn must
    not pass `tools=` (which triggers tool_use_failed on llama-3.3 + Groq)."""
    seen_tools = []

    class FakeClient:
        def __init__(self):
            self.turn = 0

        def chat_message(self, *, messages, model, temperature, max_tokens, tools=None, tool_choice=None):
            seen_tools.append(tools)
            self.turn += 1
            if self.turn == 1:
                return _msg(tool_calls=[_tool_call("c-1", "navigate", {"path": "/checkpoint-3"})])
            return _msg(content="Open CP3 to continue.")

    monkeypatch.setattr("backend.services.groq_client.GroqClient", lambda: FakeClient())
    resp = client.post("/api/copilot/message", json={
        "message": "where do I go?", "page": {"route": "/accounts", "client_id": CLIENT_ID},
    })
    assert resp.status_code == 200
    assert seen_tools[0] is not None
    assert seen_tools[1] is None


def test_message_returns_proposed_action_without_executing(client, monkeypatch):
    """Halt is a destructive proposed_action — server must NOT execute it,
    just return the proposal. Operator confirms via /actions/execute."""

    class FakeClient:
        def __init__(self):
            self.turn = 0

        def chat_message(self, *, messages, model, temperature, max_tokens, tools=None, tool_choice=None):
            self.turn += 1
            if self.turn == 1:
                return _msg(tool_calls=[_tool_call("c-1", "halt_campaign", {"client_id": CLIENT_ID, "detail": "spike"})])
            return _msg(content="I prepared a halt for your confirmation.")

    monkeypatch.setattr("backend.services.groq_client.GroqClient", lambda: FakeClient())

    resp = client.post("/api/copilot/message", json={
        "message": "halt sends",
        "page": {"route": "/campaigns", "client_id": CLIENT_ID},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["proposed_actions"]) == 1
    proposal = body["proposed_actions"][0]
    assert proposal["tool"] == "halt_campaign"
    assert proposal["confirm_token"] == "HALT"
    assert "spike" in proposal["consequence"]


# ---------------------------------------------------------------------------
# /actions/execute — server-side typed confirmation friction
# ---------------------------------------------------------------------------

def test_execute_unknown_tool_404(client):
    resp = client.post("/api/copilot/actions/execute", json={"tool": "nope", "args": {}})
    assert resp.status_code == 404


def test_execute_read_only_tool_rejected(client):
    resp = client.post("/api/copilot/actions/execute", json={"tool": "get_quota_status", "args": {}})
    assert resp.status_code == 400
    assert "not a proposed_action" in resp.json()["detail"]


def test_execute_destructive_action_requires_typed_confirmation(client, db_session):
    resp = client.post("/api/copilot/actions/execute", json={
        "tool": "halt_campaign",
        "args": {"client_id": CLIENT_ID, "detail": "test"},
    })
    assert resp.status_code == 400
    assert "exactly 'HALT'" in resp.json()["detail"]


def test_execute_halt_campaign_with_correct_token(client, db_session):
    resp = client.post("/api/copilot/actions/execute", json={
        "tool": "halt_campaign",
        "args": {"client_id": CLIENT_ID, "detail": "test halt"},
        "confirmation": "HALT",
        "actor": "alex@fcp.test",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "halt_id" in resp.json()["result"]
    halts = db_session.query(CampaignHaltRecord).filter_by(client_id=CLIENT_ID).all()
    assert len(halts) == 1


def test_execute_navigate_no_friction_returns_path(client):
    """Navigate is safe — confirm_token is null, no typed friction needed."""
    resp = client.post("/api/copilot/actions/execute", json={
        "tool": "navigate",
        "args": {"path": "/checkpoint-3"},
    })
    assert resp.status_code == 200
    assert resp.json()["result"]["path"] == "/checkpoint-3"


def test_execute_accept_handoff_full_round_trip(client, db_session):
    note = cp4_state.create_handoff(
        client_id=CLIENT_ID, account_domain="acme.test", contact_id=str(uuid.uuid4()),
        tldr_text="t", engagement_score=80,
        triggering_events=[HandoffTriggerEvent(event_type=HandoffTriggerEventType.EMAIL_REPLY, occurred_at=_now(), score_delta=25)],
        db=db_session,
    )
    cp4_state.notify_sales_exec(str(note.handoff_id), db_session)

    # Wrong token
    bad = client.post("/api/copilot/actions/execute", json={
        "tool": "accept_handoff",
        "args": {"handoff_id": str(note.handoff_id), "accepted_by": "rep@x.com"},
        "confirmation": "accept",
    })
    assert bad.status_code == 400

    # Right token
    good = client.post("/api/copilot/actions/execute", json={
        "tool": "accept_handoff",
        "args": {"handoff_id": str(note.handoff_id), "accepted_by": "rep@x.com"},
        "confirmation": "ACCEPT",
    })
    assert good.status_code == 200
    refreshed = cp4_state.get_handoff(str(note.handoff_id), db_session)
    assert refreshed.status.value == "ACCEPTED"


# ---------------------------------------------------------------------------
# Streaming endpoint
# ---------------------------------------------------------------------------

def test_stream_endpoint_yields_text_chunks_then_done(client, monkeypatch):
    class FakeClient:
        def chat_stream(self, **_):
            yield "Hello "
            yield "world"

    monkeypatch.setattr("backend.services.groq_client.GroqClient", lambda: FakeClient())

    with client.stream("POST", "/api/copilot/message/stream", json={
        "message": "hi", "page": {"route": "/accounts"},
    }) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = b"".join(resp.iter_bytes()).decode("utf-8")
    # Two text chunks + a done event.
    assert body.count("\"type\": \"text\"") == 2
    assert "\"delta\": \"Hello \"" in body
    assert "\"delta\": \"world\"" in body
    assert "\"type\": \"done\"" in body
