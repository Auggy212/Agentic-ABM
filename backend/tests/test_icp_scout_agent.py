"""
Tests for the ICP Scout Agent pipeline orchestrator and API endpoints.

Run:  pytest backend/tests/test_icp_scout_agent.py -v

All tests mock external sources and Redis; no network calls made.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.icp_scout.agent import ICPScoutAgent, _build_filters, _canonical_domain, _deduplicate
from backend.agents.icp_scout.scoring import RawCompany, RawFundingRound, RawSignal
from backend.agents.icp_scout.sources.base import ICPFilters
from backend.agents.icp_scout.sources.quota_manager import QuotaExhaustedError
from backend.db.models import Base, ICPAccountRecord, MasterContextRecord
from backend.db.session import get_db
from backend.main import app
from backend.schemas.models import DataSource, MasterContext


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_NF = "not_found"

TEST_CLIENT_ID = "aaaaaaaa-1234-5678-abcd-aaaaaaaaaaaa"


def _round(label: str = "Series A", amount: int = 5_000_000, dt: str = "2025-01-15") -> RawFundingRound:
    return RawFundingRound(round=label, amount_usd=amount, date=dt)


def _make_company(
    domain: str,
    name: str,
    industry: str = "Revenue Intelligence SaaS",
    headcount: int = 200,
    hq: str = "Austin, TX",
    techs: List[str] | None = None,
    funding_stage: str = "Series A",
    source: DataSource = DataSource.APOLLO,
) -> RawCompany:
    return RawCompany(
        domain=domain,
        company_name=name,
        website=f"https://{domain}",
        linkedin_url=None,
        industry=industry,
        headcount=headcount,
        estimated_arr=_NF,
        funding_stage=funding_stage,
        last_funding_round=_round(),
        hq_location=hq,
        technologies_used=techs or [],
        recent_signals=[],
        source=source,
        enriched_at=datetime.now(tz=timezone.utc),
    )


def _master_context(existing_account_list: str | None = None, negative_icp: List[str] | None = None) -> MasterContext:
    return MasterContext.model_validate({
        "company": {
            "name": "Acme AI",
            "website": "https://acme.ai",
            "industry": "Revenue Intelligence SaaS",
            "stage": "Series A",
            "product": "AI ABM platform",
            "value_prop": (
                "We help Series B SaaS companies cut manual prospecting by 80% "
                "using real-time buyer-intent signals and AI-driven account scoring."
            ),
            "differentiators": ["real-time signals"],
            "pricing_model": "Subscription",
            "acv_range": "$20k-$80k",
            "reference_customers": ["Gong"],
        },
        "icp": {
            "industries": ["Revenue Intelligence SaaS"],
            "company_size_employees": "100-500",
            "company_size_arr": "$5M-$50M",
            "funding_stage": ["Series A", "Series B"],
            "geographies": ["USA"],
            "tech_stack_signals": ["HubSpot"],
            "buying_triggers": ["hiring VP sales"],
            "negative_icp": negative_icp or [],
        },
        "buyers": {
            "titles": ["VP Sales"],
            "seniority": ["VP"],
            "buying_committee_size": "3-5",
            "pain_points": ["manual prospecting"],
            "unstated_needs": ["pipeline predictability"],
        },
        "competitors": [{"name": "6sense", "weaknesses": ["expensive"]}],
        "gtm": {
            "win_themes": ["ROI"],
            "loss_themes": ["budget"],
            "channels": ["LinkedIn"],
            "crm": "HubSpot",
            "existing_account_list": existing_account_list,
        },
        "meta": {
            "created_at": "2026-04-25T10:00:00Z",
            "client_id": TEST_CLIENT_ID,
            "version": "1.0.0",
        },
    })


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


# ---------------------------------------------------------------------------
# Unit: _canonical_domain
# ---------------------------------------------------------------------------

def test_canonical_domain_strips_www():
    assert _canonical_domain("www.acme.com") == "acme.com"


def test_canonical_domain_strips_scheme():
    assert _canonical_domain("https://acme.com/path") == "acme.com"


def test_canonical_domain_lowercases():
    assert _canonical_domain("ACME.COM") == "acme.com"


def test_canonical_domain_trailing_slash():
    assert _canonical_domain("acme.com/") == "acme.com"


# ---------------------------------------------------------------------------
# Unit: _deduplicate
# ---------------------------------------------------------------------------

def test_deduplicate_keeps_first_seen():
    a = _make_company("acme.com", "Acme", source=DataSource.APOLLO)
    b = _make_company("acme.com", "Acme Dup", source=DataSource.HARMONIC)
    result = _deduplicate([a, b])
    assert len(result) == 1
    assert result[0].company_name == "Acme"


def test_deduplicate_www_vs_bare():
    a = _make_company("acme.com", "Acme")
    b = _make_company("www.acme.com", "Acme www")
    assert len(_deduplicate([a, b])) == 1


def test_deduplicate_different_domains():
    a = _make_company("acme.com", "Acme")
    b = _make_company("beta.com", "Beta")
    assert len(_deduplicate([a, b])) == 2


# ---------------------------------------------------------------------------
# Unit: _build_filters
# ---------------------------------------------------------------------------

def test_build_filters_employee_range():
    mc = _master_context()
    filters = _build_filters(mc)
    assert filters.employee_range == (100, 500)


def test_build_filters_no_employee_range():
    mc = _master_context()
    mc.icp.__dict__["company_size_employees"] = "not_found"
    # Re-parse through model to ensure clean state
    filters = _build_filters(mc)
    # not_found doesn't parse to range
    assert filters.employee_range is None


def test_build_filters_includes_all_fields():
    mc = _master_context()
    filters = _build_filters(mc)
    assert "Revenue Intelligence SaaS" in filters.industries
    assert "USA" in filters.locations
    assert "HubSpot" in filters.technologies
    assert "Series A" in filters.funding_stages


# ---------------------------------------------------------------------------
# Unit: ICPScoutAgent.run — basic flow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_deduplicates_cross_source():
    mc = _master_context()
    apollo_results = [
        _make_company("acme.com", "Acme", source=DataSource.APOLLO),
        _make_company("beta.com", "Beta", source=DataSource.APOLLO),
    ]
    harmonic_results = [
        _make_company("acme.com", "Acme Harmonic", source=DataSource.HARMONIC),  # dupe
        _make_company("gamma.com", "Gamma", source=DataSource.HARMONIC),
    ]

    mock_apollo = AsyncMock()
    mock_apollo.search.return_value = apollo_results
    mock_harmonic = AsyncMock()
    mock_harmonic.search.return_value = harmonic_results
    mock_crunchbase = AsyncMock()
    mock_crunchbase.search.return_value = []
    mock_builtwith = AsyncMock()
    mock_builtwith.search.return_value = []

    with patch("backend.agents.icp_scout.agent.check_and_increment"):
        agent = ICPScoutAgent(
            apollo=mock_apollo,
            harmonic=mock_harmonic,
            crunchbase=mock_crunchbase,
            builtwith=mock_builtwith,
        )
        result = await agent.run(mc)

    domains = [a.domain for a in result.accounts]
    # acme.com should appear exactly once
    assert domains.count("acme.com") == 1
    assert len(result.accounts) == 3


@pytest.mark.asyncio
async def test_run_applies_negative_icp():
    mc = _master_context(negative_icp=["acme.com"])
    apollo_results = [
        _make_company("acme.com", "Acme"),
        _make_company("beta.com", "Beta"),
    ]

    mock_apollo = AsyncMock()
    mock_apollo.search.return_value = apollo_results
    mock_harmonic = AsyncMock()
    mock_harmonic.search.return_value = []
    mock_crunchbase = AsyncMock()
    mock_crunchbase.search.return_value = []
    mock_builtwith = AsyncMock()
    mock_builtwith.search.return_value = []

    with patch("backend.agents.icp_scout.agent.check_and_increment"):
        agent = ICPScoutAgent(
            apollo=mock_apollo,
            harmonic=mock_harmonic,
            crunchbase=mock_crunchbase,
            builtwith=mock_builtwith,
        )
        result = await agent.run(mc)

    domains = {a.domain for a in result.accounts}
    assert "acme.com" not in domains
    assert "beta.com" in domains


@pytest.mark.asyncio
async def test_run_caps_at_300():
    mc = _master_context()
    # generate 350 unique companies
    many = [_make_company(f"company{i}.com", f"Company {i}") for i in range(350)]

    mock_apollo = AsyncMock()
    mock_apollo.search.return_value = many
    mock_harmonic = AsyncMock()
    mock_harmonic.search.return_value = []
    mock_crunchbase = AsyncMock()
    mock_crunchbase.search.return_value = []
    mock_builtwith = AsyncMock()
    mock_builtwith.search.return_value = []

    with patch("backend.agents.icp_scout.agent.check_and_increment"):
        agent = ICPScoutAgent(
            apollo=mock_apollo,
            harmonic=mock_harmonic,
            crunchbase=mock_crunchbase,
            builtwith=mock_builtwith,
        )
        result = await agent.run(mc)

    assert len(result.accounts) == 300


@pytest.mark.asyncio
async def test_run_sorted_by_score_desc():
    mc = _master_context()
    companies = [_make_company(f"co{i}.com", f"Co {i}", headcount=200) for i in range(5)]

    mock_apollo = AsyncMock()
    mock_apollo.search.return_value = companies
    for src in ["harmonic", "crunchbase", "builtwith"]:
        pass

    mock_harmonic = AsyncMock()
    mock_harmonic.search.return_value = []
    mock_crunchbase = AsyncMock()
    mock_crunchbase.search.return_value = []
    mock_builtwith = AsyncMock()
    mock_builtwith.search.return_value = []

    with patch("backend.agents.icp_scout.agent.check_and_increment"):
        agent = ICPScoutAgent(
            apollo=mock_apollo,
            harmonic=mock_harmonic,
            crunchbase=mock_crunchbase,
            builtwith=mock_builtwith,
        )
        result = await agent.run(mc)

    scores = [a.icp_score for a in result.accounts]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.asyncio
async def test_run_quota_exhausted_source_skipped_others_continue():
    """When Apollo quota is exhausted, Harmonic results still make it through."""
    mc = _master_context()
    harmonic_results = [_make_company("harmonic-co.com", "Harmonic Co", source=DataSource.HARMONIC)]

    mock_apollo = AsyncMock()
    mock_harmonic = AsyncMock()
    mock_harmonic.search.return_value = harmonic_results
    mock_crunchbase = AsyncMock()
    mock_crunchbase.search.return_value = []
    mock_builtwith = AsyncMock()
    mock_builtwith.search.return_value = []

    def quota_side_effect(source_name: str) -> None:
        if source_name == "APOLLO":
            raise QuotaExhaustedError("APOLLO", 50, 50, __import__("datetime").date.today())

    with patch("backend.agents.icp_scout.agent.check_and_increment", side_effect=quota_side_effect):
        agent = ICPScoutAgent(
            apollo=mock_apollo,
            harmonic=mock_harmonic,
            crunchbase=mock_crunchbase,
            builtwith=mock_builtwith,
        )
        result = await agent.run(mc)

    # Apollo skipped but Harmonic returned its result
    domains = {a.domain for a in result.accounts}
    assert "harmonic-co.com" in domains
    # Apollo source never called
    mock_apollo.search.assert_not_called()


@pytest.mark.asyncio
async def test_run_client_upload_skips_api_sources():
    """When existing_account_list is set, API sources are not queried."""
    csv_content = b"Company Name,Website\nUpload Corp,https://upload-corp.com\n"

    mc = _master_context(existing_account_list="fake_path.csv")

    mock_apollo = AsyncMock()
    mock_harmonic = AsyncMock()
    mock_crunchbase = AsyncMock()
    mock_builtwith = AsyncMock()

    with patch(
        "backend.agents.icp_scout.sources.client_upload.os.path.isfile",
        return_value=True,
    ), patch(
        "builtins.open",
        MagicMock(return_value=__import__("io").StringIO(csv_content.decode("utf-8-sig"))),
    ), patch("backend.agents.icp_scout.agent.check_and_increment"):
        agent = ICPScoutAgent(
            apollo=mock_apollo,
            harmonic=mock_harmonic,
            crunchbase=mock_crunchbase,
            builtwith=mock_builtwith,
        )
        result = await agent.run(mc)

    # No API sources queried
    mock_apollo.search.assert_not_called()
    mock_harmonic.search.assert_not_called()
    mock_crunchbase.search.assert_not_called()
    mock_builtwith.search.assert_not_called()


@pytest.mark.asyncio
async def test_run_meta_tier_breakdown():
    mc = _master_context()
    # 2 companies with high industry+geo match (should be TIER_1 or TIER_2)
    companies = [
        _make_company("a.com", "A", industry="Revenue Intelligence SaaS", headcount=200, hq="New York, NY", techs=["HubSpot"], funding_stage="Series A"),
        _make_company("b.com", "B", industry="Fintech", headcount=50, hq="Berlin, Germany"),
    ]

    mock_apollo = AsyncMock()
    mock_apollo.search.return_value = companies
    mock_harmonic = AsyncMock()
    mock_harmonic.search.return_value = []
    mock_crunchbase = AsyncMock()
    mock_crunchbase.search.return_value = []
    mock_builtwith = AsyncMock()
    mock_builtwith.search.return_value = []

    with patch("backend.agents.icp_scout.agent.check_and_increment"):
        agent = ICPScoutAgent(
            apollo=mock_apollo,
            harmonic=mock_harmonic,
            crunchbase=mock_crunchbase,
            builtwith=mock_builtwith,
        )
        result = await agent.run(mc)

    breakdown = result.meta.tier_breakdown
    total = breakdown.tier_1 + breakdown.tier_2 + breakdown.tier_3
    assert total == result.meta.total_found


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------

def _seed_master_context(db_session, client_id: str = TEST_CLIENT_ID) -> None:
    mc = _master_context()
    record = MasterContextRecord(
        id=str(uuid.uuid4()),
        client_id=client_id,
        version="1.0.0",
        data=mc.model_dump(mode="json"),
    )
    db_session.add(record)
    db_session.commit()


def test_discover_404_missing_master_context(test_client):
    resp = test_client.post("/api/accounts/discover", json={"client_id": "nonexistent-client-id"})
    assert resp.status_code == 404


@patch("backend.api.routes.accounts.ICPScoutAgent")
def test_discover_creates_run_record(mock_agent_cls, test_client, db_session):
    _seed_master_context(db_session)
    mc = _master_context()

    mock_agent = AsyncMock()
    from backend.schemas.models import AccountListMeta, ICPAccountList, TierBreakdown
    mock_agent.run.return_value = ICPAccountList(
        accounts=[],
        meta=AccountListMeta(
            total_found=0,
            tier_breakdown=TierBreakdown(tier_1=0, tier_2=0, tier_3=0),
            generated_at=datetime.now(tz=timezone.utc),
            client_id=TEST_CLIENT_ID,
        ),
    )
    mock_agent_cls.return_value = mock_agent

    resp = test_client.post("/api/accounts/discover", json={"client_id": TEST_CLIENT_ID})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "complete"
    assert "run_id" in data


def test_list_accounts_empty(test_client):
    resp = test_client.get(f"/api/accounts?client_id={TEST_CLIENT_ID}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["accounts"] == []


def test_list_accounts_excludes_removed(test_client, db_session):
    record = ICPAccountRecord(
        id=str(uuid.uuid4()),
        client_id=TEST_CLIENT_ID,
        domain="visible.com",
        company_name="Visible",
        tier="TIER_2",
        icp_score=65,
        source="APOLLO",
        data={"domain": "visible.com", "company_name": "Visible"},
        is_removed=False,
    )
    removed = ICPAccountRecord(
        id=str(uuid.uuid4()),
        client_id=TEST_CLIENT_ID,
        domain="removed.com",
        company_name="Removed",
        tier="TIER_3",
        icp_score=40,
        source="APOLLO",
        data={"domain": "removed.com", "company_name": "Removed"},
        is_removed=True,
    )
    db_session.add_all([record, removed])
    db_session.commit()

    resp = test_client.get(f"/api/accounts?client_id={TEST_CLIENT_ID}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["accounts"][0]["domain"] == "visible.com"


def test_get_account_not_found(test_client):
    resp = test_client.get(f"/api/accounts/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_get_account_removed_returns_410(test_client, db_session):
    account_id = str(uuid.uuid4())
    record = ICPAccountRecord(
        id=account_id,
        client_id=TEST_CLIENT_ID,
        domain="gone.com",
        company_name="Gone",
        tier="TIER_3",
        icp_score=30,
        source="APOLLO",
        data={"domain": "gone.com"},
        is_removed=True,
        removed_reason="Test removal",
    )
    db_session.add(record)
    db_session.commit()

    resp = test_client.get(f"/api/accounts/{account_id}")
    assert resp.status_code == 410


def test_get_account_success(test_client, db_session):
    account_id = str(uuid.uuid4())
    record = ICPAccountRecord(
        id=account_id,
        client_id=TEST_CLIENT_ID,
        domain="found.com",
        company_name="Found",
        tier="TIER_2",
        icp_score=70,
        source="HARMONIC",
        data={"domain": "found.com", "company_name": "Found"},
        is_removed=False,
    )
    db_session.add(record)
    db_session.commit()

    resp = test_client.get(f"/api/accounts/{account_id}")
    assert resp.status_code == 200
    assert resp.json()["domain"] == "found.com"


def test_delete_account_soft_deletes(test_client, db_session):
    account_id = str(uuid.uuid4())
    record = ICPAccountRecord(
        id=account_id,
        client_id=TEST_CLIENT_ID,
        domain="todelete.com",
        company_name="ToDelete",
        tier="TIER_2",
        icp_score=62,
        source="APOLLO",
        data={"domain": "todelete.com"},
        is_removed=False,
    )
    db_session.add(record)
    db_session.commit()

    resp = test_client.delete(
        f"/api/accounts/{account_id}",
        params={"reason": "Not a fit"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "removed"

    # Row still exists (soft delete)
    db_session.expire_all()
    still_there = db_session.query(ICPAccountRecord).filter_by(id=account_id).first()
    assert still_there is not None
    assert still_there.is_removed is True
    assert still_there.removed_reason == "Not a fit"


def test_delete_account_already_removed(test_client, db_session):
    account_id = str(uuid.uuid4())
    record = ICPAccountRecord(
        id=account_id,
        client_id=TEST_CLIENT_ID,
        domain="already-gone.com",
        company_name="Already Gone",
        tier="TIER_3",
        icp_score=30,
        source="APOLLO",
        data={"domain": "already-gone.com"},
        is_removed=True,
    )
    db_session.add(record)
    db_session.commit()

    resp = test_client.delete(f"/api/accounts/{account_id}")
    assert resp.status_code == 409


def test_delete_account_not_found(test_client):
    resp = test_client.delete(f"/api/accounts/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_list_accounts_paginated(test_client, db_session):
    for i in range(10):
        db_session.add(ICPAccountRecord(
            id=str(uuid.uuid4()),
            client_id=TEST_CLIENT_ID,
            domain=f"page{i}.com",
            company_name=f"Page {i}",
            tier="TIER_2",
            icp_score=60 + i,
            source="APOLLO",
            data={"domain": f"page{i}.com"},
            is_removed=False,
        ))
    db_session.commit()

    resp = test_client.get(f"/api/accounts?client_id={TEST_CLIENT_ID}&page=1&page_size=5")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 10
    assert len(data["accounts"]) == 5

    resp2 = test_client.get(f"/api/accounts?client_id={TEST_CLIENT_ID}&page=2&page_size=5")
    data2 = resp2.json()
    assert len(data2["accounts"]) == 5


def test_list_accounts_filter_by_tier(test_client, db_session):
    for tier, score in [("TIER_1", 85), ("TIER_1", 90), ("TIER_2", 65), ("TIER_3", 30)]:
        db_session.add(ICPAccountRecord(
            id=str(uuid.uuid4()),
            client_id=TEST_CLIENT_ID,
            domain=f"tier-{score}.com",
            company_name=f"Co {score}",
            tier=tier,
            icp_score=score,
            source="APOLLO",
            data={"domain": f"tier-{score}.com"},
            is_removed=False,
        ))
    db_session.commit()

    resp = test_client.get(f"/api/accounts?client_id={TEST_CLIENT_ID}&tier=TIER_1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    for acc in data["accounts"]:
        assert acc["domain"].startswith("tier-8") or acc["domain"].startswith("tier-9")
