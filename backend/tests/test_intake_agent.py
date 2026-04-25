"""
Tests for the Intake Agent (Phase 1).

Run:  pytest backend/tests/test_intake_agent.py -v

External services (Redis, Postgres) are mocked so the suite is fully
self-contained and runs without any live infrastructure.
"""

from __future__ import annotations

import io
import json
import uuid
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

from backend.agents.intake.agent import CsvParseResult, IntakeAgent
from backend.agents.intake import vague_detectors as vd
from backend.db.models import Base
from backend.db.session import get_db
from backend.main import app
from backend.schemas.models import MasterContext


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def agent() -> IntakeAgent:
    return IntakeAgent()


@pytest.fixture
def valid_submission() -> Dict[str, Any]:
    """Minimal fully-valid intake payload (no meta — agent fills it)."""
    return {
        "company": {
            "name": "Acme AI",
            "website": "https://acme.ai",
            "industry": "Revenue Intelligence SaaS",
            "stage": "Series A",
            "product": "AI-powered account-based marketing platform for B2B revenue teams",
            "value_prop": (
                "We help Series B SaaS companies cut manual prospecting time by 80% "
                "using real-time buyer-intent signals and AI-driven account scoring."
            ),
            "differentiators": ["real-time intent signals", "native HubSpot two-way sync"],
            "pricing_model": "Subscription",
            "acv_range": "$20k-$80k",
            "reference_customers": ["Salesforce", "Gong"],
        },
        "icp": {
            "industries": ["Revenue Intelligence SaaS", "Fintech"],
            "company_size_employees": "50-500",
            "company_size_arr": "$1M-$20M",
            "funding_stage": ["Series A", "Series B"],
            "geographies": ["USA", "Canada"],
            "tech_stack_signals": ["HubSpot", "Salesforce"],
            "buying_triggers": ["new funding", "headcount growth", "new VP Sales hire"],
            "negative_icp": ["competitor.com", "gov-only.org"],
        },
        "buyers": {
            "titles": ["VP of Sales", "Chief Revenue Officer"],
            "seniority": ["VP", "C-Suite"],
            "buying_committee_size": "3-5",
            "pain_points": [
                "Reps spend 60% of their week on manual account research",
                "CRM data is stale within 30 days of entry",
            ],
            "unstated_needs": ["pipeline predictability", "rep ramp time reduction"],
        },
        "competitors": [
            {"name": "6sense", "weaknesses": ["expensive", "complex setup"]},
        ],
        "gtm": {
            "win_themes": ["ROI in 90 days", "seamless HubSpot integration"],
            "loss_themes": ["budget constraints", "incumbent vendor lock-in"],
            "channels": ["LinkedIn", "Email"],
            "crm": "HubSpot",
            "existing_account_list": None,
        },
        "negative_icp_confirmed_empty": False,
    }


# ---------------------------------------------------------------------------
# In-memory SQLite override for DB tests
# ---------------------------------------------------------------------------

@pytest.fixture
def test_client():
    """
    TestClient with DB and Redis dependencies fully overridden.

    Creates a single in-memory SQLite engine and wires both the schema
    creation and the get_db override to the same engine so INSERT/SELECT
    see the same tables.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        # StaticPool reuses a single underlying connection so that create_all
        # and the ORM sessions that run inside request handlers all see the
        # same in-memory database (the default pool creates a new connection
        # per checkout, which creates a fresh empty DB each time).
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # In-memory Redis stub
    store: Dict[str, str] = {}

    def fake_save(client_id: str, payload: dict) -> None:
        store[client_id] = json.dumps(payload)

    def fake_load(client_id: str):
        raw = store.get(client_id)
        return json.loads(raw) if raw else None

    def fake_delete(client_id: str) -> None:
        store.pop(client_id, None)

    with (
        patch("backend.api.routes.intake.redis_client.save_draft", side_effect=fake_save),
        patch("backend.api.routes.intake.redis_client.load_draft", side_effect=fake_load),
        patch("backend.api.routes.intake.redis_client.delete_draft", side_effect=fake_delete),
    ):
        with TestClient(app) as client:
            yield client, store

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# IntakeAgent unit tests
# ---------------------------------------------------------------------------

class TestValidateComplete:
    def test_valid_submission_returns_complete(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        result = agent.validate(valid_submission)
        assert result.valid is True
        assert result.errors == []
        assert result.clarifying_questions == [], (
            f"Unexpected questions: {result.clarifying_questions}"
        )

    def test_build_master_context_returns_model(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        ctx = agent.build_master_context(valid_submission)
        assert isinstance(ctx, MasterContext)
        assert ctx.company.name == "Acme AI"
        assert ctx.meta.version == "1.0.0"
        # meta.client_id must be a fresh UUID
        assert isinstance(ctx.meta.client_id, uuid.UUID)

    def test_meta_not_required_in_submission(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        """Caller should not need to provide meta — agent fills it."""
        sub = {k: v for k, v in valid_submission.items() if k != "meta"}
        result = agent.validate(sub)
        assert result.valid is True


class TestVagueEmployeeSize:
    def test_smbs_triggers_clarifying_question(self, agent: IntakeAgent, valid_submission: dict) -> None:
        valid_submission["icp"]["company_size_employees"] = "SMBs"
        result = agent.validate(valid_submission)
        fields = [q["field"] for q in result.clarifying_questions]
        assert "icp.company_size_employees" in fields, (
            f"Expected question for company_size_employees, got: {result.clarifying_questions}"
        )

    def test_mid_market_triggers_question(self, agent: IntakeAgent, valid_submission: dict) -> None:
        valid_submission["icp"]["company_size_employees"] = "mid-market"
        result = agent.validate(valid_submission)
        fields = [q["field"] for q in result.clarifying_questions]
        assert "icp.company_size_employees" in fields

    def test_numeric_range_passes(self, agent: IntakeAgent, valid_submission: dict) -> None:
        valid_submission["icp"]["company_size_employees"] = "200-1000"
        result = agent.validate(valid_submission)
        fields = [q["field"] for q in result.clarifying_questions]
        assert "icp.company_size_employees" not in fields

    def test_is_vague_direct_call(self, agent: IntakeAgent) -> None:
        q = agent.is_vague("icp.company_size_employees", "SMBs")
        assert q is not None
        assert "range" in q.lower() or "employee" in q.lower()

    def test_is_vague_numeric_returns_none(self, agent: IntakeAgent) -> None:
        q = agent.is_vague("icp.company_size_employees", "50-500")
        assert q is None


class TestNegativeIcpConfirmation:
    def test_empty_without_flag_triggers_question(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        valid_submission["icp"]["negative_icp"] = []
        valid_submission["negative_icp_confirmed_empty"] = False
        result = agent.validate(valid_submission)
        fields = [q["field"] for q in result.clarifying_questions]
        assert "icp.negative_icp" in fields, (
            f"Expected question for icp.negative_icp, got: {result.clarifying_questions}"
        )

    def test_empty_with_flag_true_passes(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        valid_submission["icp"]["negative_icp"] = []
        valid_submission["negative_icp_confirmed_empty"] = True
        result = agent.validate(valid_submission)
        fields = [q["field"] for q in result.clarifying_questions]
        assert "icp.negative_icp" not in fields, (
            "Empty negative_icp with confirmed flag must NOT generate a question"
        )

    def test_populated_negative_icp_no_question(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        valid_submission["icp"]["negative_icp"] = ["competitor.com"]
        valid_submission["negative_icp_confirmed_empty"] = False
        result = agent.validate(valid_submission)
        fields = [q["field"] for q in result.clarifying_questions]
        assert "icp.negative_icp" not in fields

    def test_null_negative_icp_produces_error_not_just_question(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        """None must be a hard validation error (Pydantic), not just a clarifying question."""
        valid_submission["icp"]["negative_icp"] = None
        result = agent.validate(valid_submission)
        assert result.valid is False
        error_fields = [e["field"] for e in result.errors]
        assert any("negative_icp" in f for f in error_fields)


class TestVagueValueProp:
    def test_short_value_prop_triggers_question(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        valid_submission["company"]["value_prop"] = "We sell software."
        result = agent.validate(valid_submission)
        fields = [q["field"] for q in result.clarifying_questions]
        assert "company.value_prop" in fields

    def test_long_enough_value_prop_passes(
        self, agent: IntakeAgent, valid_submission: dict
    ) -> None:
        valid_submission["company"]["value_prop"] = (
            "We help Series A SaaS companies reduce their customer churn by 30% "
            "through AI-powered early warning systems and automated health scoring."
        )
        result = agent.validate(valid_submission)
        fields = [q["field"] for q in result.clarifying_questions]
        assert "company.value_prop" not in fields


# ---------------------------------------------------------------------------
# Draft save + resume round-trip
# ---------------------------------------------------------------------------

class TestDraftRoundTrip:
    def test_save_and_resume_draft(self, test_client, valid_submission: dict) -> None:
        client, store = test_client
        client_id = str(uuid.uuid4())

        # Save
        resp = client.post(
            "/api/intake/draft",
            json={"client_id": client_id, "payload": valid_submission},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["draft_id"] == client_id
        assert "saved_at" in body

        # Resume
        resp = client.get(f"/api/intake/draft/{client_id}")
        assert resp.status_code == 200, resp.text
        resumed = resp.json()
        assert resumed["company"]["name"] == valid_submission["company"]["name"]

    def test_resume_nonexistent_draft_returns_404(self, test_client) -> None:
        client, _ = test_client
        resp = client.get(f"/api/intake/draft/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_save_invalid_client_id_returns_422(self, test_client) -> None:
        client, _ = test_client
        resp = client.post(
            "/api/intake/draft",
            json={"client_id": "not-a-uuid", "payload": {}},
        )
        assert resp.status_code == 422

    def test_draft_payload_roundtrip_preserves_all_fields(
        self, test_client, valid_submission: dict
    ) -> None:
        client, _ = test_client
        client_id = str(uuid.uuid4())
        client.post(
            "/api/intake/draft",
            json={"client_id": client_id, "payload": valid_submission},
        )
        resumed = client.get(f"/api/intake/draft/{client_id}").json()
        # Spot-check nested fields survive the JSON round-trip
        assert resumed["icp"]["buying_triggers"] == valid_submission["icp"]["buying_triggers"]
        assert resumed["gtm"]["channels"] == valid_submission["gtm"]["channels"]


# ---------------------------------------------------------------------------
# Full intake endpoint
# ---------------------------------------------------------------------------

class TestIntakeEndpoint:
    def test_complete_submission_returns_master_context(
        self, test_client, valid_submission: dict
    ) -> None:
        client, _ = test_client
        resp = client.post("/api/intake", json=valid_submission)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "complete"
        assert body["master_context"] is not None
        ctx = body["master_context"]
        assert ctx["company"]["name"] == "Acme AI"
        assert "meta" in ctx
        assert ctx["meta"]["version"] == "1.0.0"

    def test_vague_submission_returns_needs_clarification(
        self, test_client, valid_submission: dict
    ) -> None:
        client, _ = test_client
        valid_submission["icp"]["company_size_employees"] = "SMBs"
        resp = client.post("/api/intake", json=valid_submission)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "needs_clarification"
        question_fields = [q["field"] for q in body["clarifying_questions"]]
        assert "icp.company_size_employees" in question_fields


# ---------------------------------------------------------------------------
# CSV upload
# ---------------------------------------------------------------------------

class TestCsvUpload:
    def _make_csv(self, *rows: str) -> bytes:
        return "\n".join(rows).encode()

    def test_valid_csv_accepted(self, test_client) -> None:
        client, _ = test_client
        csv_bytes = self._make_csv(
            "Company Name,Website,Industry",
            "Acme Corp,https://acme.com,SaaS",
            "Beta Inc,https://beta.io,Fintech",
        )
        resp = client.post(
            "/api/intake/csv",
            files={"file": ("accounts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["valid"] is True
        assert body["row_count"] == 2

    def test_missing_website_column_rejected(self, test_client) -> None:
        """
        CSV missing the required 'Website' column must be rejected with a
        specific error code — CSV_MISSING_COLUMNS.
        """
        client, _ = test_client
        csv_bytes = self._make_csv(
            "Company Name,Industry",
            "Acme Corp,SaaS",
        )
        resp = client.post(
            "/api/intake/csv",
            files={"file": ("accounts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["valid"] is False
        assert any("CSV_MISSING_COLUMNS" in e for e in body["errors"]), (
            f"Expected CSV_MISSING_COLUMNS error, got: {body['errors']}"
        )
        assert any("Website" in e for e in body["errors"])

    def test_missing_company_name_column_rejected(self, test_client) -> None:
        client, _ = test_client
        csv_bytes = self._make_csv(
            "Website,Industry",
            "https://acme.com,SaaS",
        )
        resp = client.post(
            "/api/intake/csv",
            files={"file": ("accounts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        body = resp.json()
        assert body["valid"] is False
        assert any("Company Name" in e for e in body["errors"])

    def test_both_columns_missing_rejected(self, test_client) -> None:
        client, _ = test_client
        csv_bytes = self._make_csv("Industry,Revenue", "SaaS,$10M")
        resp = client.post(
            "/api/intake/csv",
            files={"file": ("accounts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        body = resp.json()
        assert body["valid"] is False

    def test_non_csv_file_rejected(self, test_client) -> None:
        client, _ = test_client
        resp = client.post(
            "/api/intake/csv",
            files={"file": ("accounts.xlsx", io.BytesIO(b"not csv"), "application/octet-stream")},
        )
        assert resp.status_code == 415

    def test_extra_columns_produce_warning_not_error(self, test_client) -> None:
        client, _ = test_client
        csv_bytes = self._make_csv(
            "Company Name,Website,Revenue,Headcount",
            "Acme,https://acme.com,$5M,200",
        )
        resp = client.post(
            "/api/intake/csv",
            files={"file": ("accounts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        body = resp.json()
        assert body["valid"] is True
        assert any("Revenue" in w or "Headcount" in w for w in body["warnings"])

    def test_preview_capped_at_5_rows(self, test_client) -> None:
        client, _ = test_client
        rows = ["Company Name,Website"] + [
            f"Company {i},https://company{i}.com" for i in range(10)
        ]
        csv_bytes = self._make_csv(*rows)
        resp = client.post(
            "/api/intake/csv",
            files={"file": ("accounts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        body = resp.json()
        assert body["row_count"] == 10
        assert len(body["preview"]) == 5


# ---------------------------------------------------------------------------
# Vague-detector unit tests (pure functions)
# ---------------------------------------------------------------------------

class TestVagueDetectors:
    def test_check_value_prop_short(self) -> None:
        assert vd.check_value_prop("We sell great software.") is not None

    def test_check_value_prop_ok(self) -> None:
        assert vd.check_value_prop(
            "We help revenue teams at Series B SaaS companies cut manual "
            "prospecting by 80% using real-time buyer-intent signals."
        ) is None

    def test_check_icp_industries_broad(self) -> None:
        assert vd.check_icp_industries(["Tech", "SaaS"]) is not None

    def test_check_icp_industries_specific(self) -> None:
        assert vd.check_icp_industries(["Revenue Intelligence", "FinTech"]) is None

    def test_check_company_size_smb(self) -> None:
        assert vd.check_company_size_employees("SMB") is not None

    def test_check_company_size_numeric(self) -> None:
        assert vd.check_company_size_employees("50-500") is None

    def test_check_negative_icp_empty_no_confirm(self) -> None:
        assert vd.check_negative_icp([], confirmed_empty=False) is not None

    def test_check_negative_icp_empty_confirmed(self) -> None:
        assert vd.check_negative_icp([], confirmed_empty=True) is None

    def test_check_negative_icp_populated(self) -> None:
        assert vd.check_negative_icp(["competitor.com"], confirmed_empty=False) is None

    def test_check_pain_points_too_short(self) -> None:
        assert vd.check_pain_points(["manual work", "bad data"]) is not None

    def test_check_pain_points_ok(self) -> None:
        assert vd.check_pain_points([
            "Reps spend 60% of their week on manual research",
        ]) is None
