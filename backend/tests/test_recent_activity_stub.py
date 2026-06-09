"""
Tests for the Phase 3 RecentActivityStub rails.

Run: pytest backend/tests/test_recent_activity_stub.py -v
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.recent_activity.agent import RecentActivityAgent
from backend.agents.recent_activity.phantombuster_client import PhantomBusterClient
from backend.db.models import Base, BuyerProfileRecord, RecentActivityRecord
from backend.db.session import get_db
from backend.main import app
from backend.schemas.models import (
    BuyerIntelMeta,
    BuyerIntelPackage,
    BuyerProfile,
    CommitteeRole,
    InferredPainPoint,
    Seniority,
)


CLIENT_ID = "aaaaaaaa-1234-5678-abcd-aaaaaaaaaaaa"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _profile(contact_id: str | None = None, email: str = "priya@acme.in") -> BuyerProfile:
    return BuyerProfile(
        contact_id=uuid.UUID(contact_id) if contact_id else uuid.uuid4(),
        account_domain="acme.in",
        full_name="Priya Sharma",
        first_name="Priya",
        last_name="Sharma",
        current_title="VP of Sales",
        apollo_title="VP Sales",
        title_mismatch_flag=True,
        seniority=Seniority.VP,
        department="Sales",
        email=email,
        email_status="UNVERIFIED",
        phone=None,
        linkedin_url="https://linkedin.com/in/priyasharma",
        tenure_current_role_months=4,
        tenure_current_company_months=24,
        past_experience=[],
        recent_activity=[],
        job_change_signal=True,
        committee_role=CommitteeRole.DECISION_MAKER,
        committee_role_confidence=0.9,
        committee_role_reasoning="VP-level buyer.",
        inferred_pain_points=[
            InferredPainPoint(
                pain_point="[INFERRED] Pipeline reporting gaps",
                source="master_context",
                confidence=0.7,
            )
        ],
        source="APOLLO",
        enriched_at=_now(),
    )


def _package(profiles: list[BuyerProfile]) -> BuyerIntelPackage:
    accounts: dict[str, list[BuyerProfile]] = {}
    for profile in profiles:
        accounts.setdefault(profile.account_domain, []).append(profile)

    return BuyerIntelPackage(
        client_id=uuid.UUID(CLIENT_ID),
        generated_at=_now(),
        accounts=accounts,
        meta=BuyerIntelMeta(
            total_accounts_processed=len(accounts),
            total_contacts_found=len(profiles),
            contacts_per_account_avg=float(len(profiles)),
            hunter_quota_used=0,
            apollo_quota_used=0,
            mismatches_flagged=sum(1 for p in profiles if p.title_mismatch_flag),
        ),
    )


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)
    session = TestingSessionLocal()
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


def _persist_profile(db_session, profile: BuyerProfile) -> None:
    db_session.add(
        BuyerProfileRecord(
            client_id=CLIENT_ID,
            account_domain=profile.account_domain,
            contact_id=str(profile.contact_id),
            committee_role=profile.committee_role.value,
            source=profile.source.value,
            data=profile.model_dump(mode="json"),
        )
    )
    db_session.commit()


@pytest.mark.asyncio
async def test_stub_agent_run_produces_empty_recent_activity_for_every_contact() -> None:
    profiles = [_profile(email="one@acme.in"), _profile(email="two@acme.in")]
    result = await RecentActivityAgent().run(CLIENT_ID, _package(profiles))

    assert set(result.keys()) == {str(p.contact_id) for p in profiles}
    for stub in result.values():
        assert stub.posts == []
        assert stub.comments == []
        assert stub.likes == []
        assert stub.last_active_at is None
        assert stub.data_freshness.value == "STALE"
        assert stub.source.value == "PHANTOMBUSTER"


def test_phantombuster_client_is_unambiguously_deferred() -> None:
    client = PhantomBusterClient()
    with pytest.raises(NotImplementedError, match="deferred to Phase 5"):
        client.scrape_profile_activity("https://linkedin.com/in/priyasharma")


def test_get_contact_endpoint_returns_empty_stub_shape(test_client, db_session) -> None:
    profile = _profile()
    _persist_profile(db_session, profile)

    response = test_client.get(f"/api/recent-activity?contact_id={profile.contact_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["contact_id"] == str(profile.contact_id)
    assert data["posts"] == []
    assert data["comments"] == []
    assert data["likes"] == []
    assert data["last_active_at"] is None
    assert data["data_freshness"] == "STALE"
    assert data["source"] == "PHANTOMBUSTER"

    row = (
        db_session.query(RecentActivityRecord)
        .filter(RecentActivityRecord.contact_id == str(profile.contact_id))
        .one()
    )
    assert row.has_data is False


def test_discover_and_get_client_endpoint_return_map_with_empty_arrays(
    test_client,
    db_session,
) -> None:
    profiles = [_profile(email="one@acme.in"), _profile(email="two@acme.in")]
    for profile in profiles:
        _persist_profile(db_session, profile)

    discover = test_client.post("/api/recent-activity/discover", json={"client_id": CLIENT_ID})
    assert discover.status_code == 202
    assert discover.json()["total_contacts"] == 2

    response = test_client.get(f"/api/recent-activity?client_id={CLIENT_ID}")
    assert response.status_code == 200
    data = response.json()
    assert set(data.keys()) == {str(p.contact_id) for p in profiles}
    assert all(stub["posts"] == [] for stub in data.values())
    assert all(stub["comments"] == [] for stub in data.values())
    assert all(stub["likes"] == [] for stub in data.values())

    rows = db_session.query(RecentActivityRecord).all()
    assert len(rows) == 2
    assert all(row.has_data is False for row in rows)
