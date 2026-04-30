"""
End-to-end tests for the Phase 3 Checkpoint 2 state manager + API + gate.

Run: pytest backend/tests/test_cp2_state_manager.py -v
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.cp2 import state_manager
from backend.agents.cp2.gate import CP2NotApprovedError, assert_cp2_approved
from backend.agents.cp2.invariants import compute_blockers
from backend.db.models import (
    Base,
    BuyerProfileRecord,
    CP2AuditLogRecord,
    CP2ReviewStateRecord,
    SignalReportRecord,
)
from backend.db.session import get_db
from backend.main import app
from backend.schemas.models import (
    AccountSignal,
    AccountTier,
    BuyerProfile,
    BuyingStage,
    BuyingStageMethod,
    CP2BlockerType,
    CP2Status,
    ClaimSourceType,
    CommitteeRole,
    CompetitiveLandscapeEntry,
    EvidenceStatus,
    GeneratedBy,
    InferredPainPoint,
    IntelInferredPainPoint,
    IntelReport,
    IntentLevel,
    RecentNewsItem,
    ReviewDecision,
    Seniority,
    SignalReport,
    SignalScore,
    SignalSource,
    SignalType,
    StrategicPriority,
)


CLIENT_ID = "11111111-2222-3333-4444-555555555555"


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


def _profile(domain: str, name: str, n_pains: int = 1) -> BuyerProfile:
    return BuyerProfile(
        contact_id=uuid.uuid4(),
        account_domain=domain,
        full_name=name,
        first_name=name.split()[0],
        last_name=name.split()[-1],
        current_title="VP of Sales",
        apollo_title="VP Sales",
        title_mismatch_flag=True,
        seniority=Seniority.VP,
        department="Sales",
        email=f"{name.lower().replace(' ', '.')}@{domain}",
        email_status="UNVERIFIED",
        phone=None,
        linkedin_url=f"https://linkedin.com/in/{name.lower().replace(' ', '')}",
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
                pain_point=f"[INFERRED] Pain {i + 1} for {name}",
                source="master_context",
                confidence=0.7,
            )
            for i in range(n_pains)
        ],
        source="APOLLO",
        enriched_at=_now(),
    )


def _intel_report() -> IntelReport:
    return IntelReport(
        company_snapshot="Acme is scaling [INFERRED] aggressively.",
        strategic_priorities=[
            StrategicPriority(
                priority="Expand internationally",
                evidence="3 new EU job postings",
                evidence_status=EvidenceStatus.INFERRED,
                source_url="https://example.com/jobs",
            ),
            StrategicPriority(
                priority="Cut churn",
                evidence="Customer success VP hired",
                evidence_status=EvidenceStatus.VERIFIED,
                source_url="https://example.com/announce",
            ),
        ],
        tech_stack=["Snowflake", "dbt"],
        competitive_landscape=[
            CompetitiveLandscapeEntry(
                competitor_name="Rival Inc",
                evidence="LinkedIn pages cross-followed",
                evidence_status=EvidenceStatus.INFERRED,
                source_url="https://example.com/rivals",
            ),
        ],
        inferred_pain_points=[
            IntelInferredPainPoint(
                pain_point="Manual reporting",
                evidence_status=EvidenceStatus.INFERRED,
                reasoning="Job posting mentions Excel",
            ),
        ],
        recent_news=[
            RecentNewsItem(
                headline="Acme announces Series B",
                date=date(2026, 1, 15),
                source_url="https://example.com/news",
                summary="$50M round",
            ),
        ],
        buying_committee_summary="VP-led",
        recommended_angle="Lead with reporting automation",
        generated_by=GeneratedBy(researcher="perplexity", synthesizer="claude-sonnet-4"),
        generated_at=_now(),
    )


def _signal_report(domain: str, tier: AccountTier, with_intel: bool) -> SignalReport:
    return SignalReport(
        account_domain=domain,
        tier=tier,
        signals=[
            AccountSignal(
                signal_id=uuid.uuid4(),
                type=SignalType.FUNDING,
                intent_level=IntentLevel.HIGH,
                description="Series B announced",
                source=SignalSource.CRUNCHBASE,
                source_url="https://example.com/cb",
                detected_at=_now(),
                evidence_snippet="Acme raised $50M",
            ),
        ],
        signal_score=SignalScore(high_count=1, medium_count=0, low_count=0, total_score=10),
        buying_stage=BuyingStage.EVALUATING,
        buying_stage_method=BuyingStageMethod.RULES,
        buying_stage_reasoning="High-intent funding signal.",
        recommended_outreach_approach="Lead with growth narrative.",
        intel_report=_intel_report() if with_intel else None,
    )


def _persist_profile(db, profile: BuyerProfile) -> None:
    db.add(
        BuyerProfileRecord(
            client_id=CLIENT_ID,
            account_domain=profile.account_domain,
            contact_id=str(profile.contact_id),
            committee_role=profile.committee_role.value,
            source=profile.source.value,
            data=profile.model_dump(mode="json"),
        )
    )
    db.commit()


def _persist_signal(db, report: SignalReport) -> None:
    db.add(
        SignalReportRecord(
            client_id=CLIENT_ID,
            account_domain=report.account_domain,
            data=report.model_dump(mode="json"),
            buying_stage=report.buying_stage.value,
            has_intel_report=report.intel_report is not None,
        )
    )
    db.commit()


@pytest.fixture()
def seeded_db(db_session):
    """Two accounts: tier-1 acme.in (intel report + 2 buyers) and tier-3 beta.io (1 buyer)."""

    p1 = _profile("acme.in", "Priya Sharma", n_pains=2)
    p2 = _profile("acme.in", "Amit Roy", n_pains=1)
    p3 = _profile("beta.io", "Sara Patel", n_pains=1)
    for profile in (p1, p2, p3):
        _persist_profile(db_session, profile)

    _persist_signal(db_session, _signal_report("acme.in", AccountTier.TIER_1, with_intel=True))
    _persist_signal(db_session, _signal_report("beta.io", AccountTier.TIER_3, with_intel=False))
    return db_session


# ---------------------------------------------------------------------------
# State manager — claim aggregation
# ---------------------------------------------------------------------------

def test_open_review_aggregates_buyer_pain_and_intel_report_inferred_claims(seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)

    # Buyer pains: Priya 2 + Amit 1 + Sara 1 = 4
    # Intel inferred: 1 strategic_priority (only INFERRED one) + 1 competitor + 1 pain = 3
    # Verified strategic_priority must NOT appear.
    by_source: dict[ClaimSourceType, int] = {}
    for claim in state.inferred_claims_review:
        by_source[claim.source_type] = by_source.get(claim.source_type, 0) + 1

    assert by_source[ClaimSourceType.BUYER_PAIN_POINT] == 4
    assert by_source[ClaimSourceType.INTEL_REPORT_PRIORITY] == 1
    assert by_source[ClaimSourceType.INTEL_REPORT_COMPETITOR] == 1
    assert by_source[ClaimSourceType.INTEL_REPORT_PAIN] == 1
    assert state.aggregate_progress.total_inferred_claims == 7
    # 2 accounts (acme.in is tier-1 -> intel_report_approved=False, beta.io tier-3 -> null)
    assert len(state.account_approvals) == 2
    tiers = {a.account_domain: a.intel_report_approved for a in state.account_approvals}
    assert tiers["acme.in"] is False
    assert tiers["beta.io"] is None


def test_open_review_is_idempotent_on_existing_in_review(seeded_db) -> None:
    first = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    second = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    assert {str(c.claim_id) for c in first.inferred_claims_review} == {
        str(c.claim_id) for c in second.inferred_claims_review
    }


# ---------------------------------------------------------------------------
# State manager — claim review
# ---------------------------------------------------------------------------

def test_review_claim_corrected_requires_text(seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    claim_id = str(state.inferred_claims_review[0].claim_id)

    with pytest.raises(state_manager.CP2StateError, match="corrected_text"):
        state_manager.review_claim(
            client_id=CLIENT_ID,
            claim_id=claim_id,
            decision=ReviewDecision.CORRECTED,
            reviewer="ops@sennen.io",
            corrected_text=None,
            db=seeded_db,
        )


def test_review_claim_approved_updates_aggregate_and_blockers(seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    claim_id = str(state.inferred_claims_review[0].claim_id)
    after = state_manager.review_claim(
        client_id=CLIENT_ID,
        claim_id=claim_id,
        decision=ReviewDecision.APPROVED,
        reviewer="ops@sennen.io",
        db=seeded_db,
    )
    assert after.aggregate_progress.approved_claims == 1
    assert after.aggregate_progress.reviewed_claims == 1
    blocker_types = {b.type for b in after.blockers}
    # 6 still pending + 2 accounts pending
    assert CP2BlockerType.UNREVIEWED_CLAIMS in blocker_types
    assert CP2BlockerType.UNAPPROVED_ACCOUNTS in blocker_types


def test_review_claim_unknown_id_raises(seeded_db) -> None:
    state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    with pytest.raises(state_manager.CP2NotFoundError):
        state_manager.review_claim(
            client_id=CLIENT_ID,
            claim_id=str(uuid.uuid4()),
            decision=ReviewDecision.APPROVED,
            reviewer="ops@sennen.io",
            db=seeded_db,
        )


# ---------------------------------------------------------------------------
# State manager — account approval
# ---------------------------------------------------------------------------

def test_approve_account_blocked_when_claims_pending(seeded_db) -> None:
    state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    with pytest.raises(state_manager.CP2StateError, match="pending review"):
        state_manager.approve_account(
            client_id=CLIENT_ID,
            account_domain="beta.io",
            reviewer="ops@sennen.io",
            db=seeded_db,
        )


def test_approve_account_succeeds_after_clearing_pending_claims(seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    for claim in state.inferred_claims_review:
        if claim.account_domain == "beta.io":
            state_manager.review_claim(
                client_id=CLIENT_ID,
                claim_id=str(claim.claim_id),
                decision=ReviewDecision.APPROVED,
                reviewer="ops@sennen.io",
                db=seeded_db,
            )
    after = state_manager.approve_account(
        client_id=CLIENT_ID,
        account_domain="beta.io",
        reviewer="ops@sennen.io",
        db=seeded_db,
    )
    beta = next(a for a in after.account_approvals if a.account_domain == "beta.io")
    assert beta.account_decision.value == "APPROVED"
    assert beta.buyer_profiles_approved is True


# ---------------------------------------------------------------------------
# State manager — final approve / gate
# ---------------------------------------------------------------------------

def _approve_everything(db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", db)
    for claim in state.inferred_claims_review:
        state_manager.review_claim(
            client_id=CLIENT_ID,
            claim_id=str(claim.claim_id),
            decision=ReviewDecision.APPROVED,
            reviewer="ops@sennen.io",
            db=db,
        )
    for account in state.account_approvals:
        state_manager.approve_account(
            client_id=CLIENT_ID,
            account_domain=account.account_domain,
            reviewer="ops@sennen.io",
            db=db,
        )


def test_approve_cp2_blocked_when_one_claim_pending(seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    # Approve all but one
    for claim in state.inferred_claims_review[:-1]:
        state_manager.review_claim(
            client_id=CLIENT_ID,
            claim_id=str(claim.claim_id),
            decision=ReviewDecision.APPROVED,
            reviewer="ops@sennen.io",
            db=seeded_db,
        )
    with pytest.raises(state_manager.CP2StateError, match="pending review"):
        state_manager.approve_cp2(
            client_id=CLIENT_ID,
            reviewer="ops@sennen.io",
            db=seeded_db,
        )


def test_approve_cp2_succeeds_when_everything_decided(seeded_db) -> None:
    _approve_everything(seeded_db)
    state = state_manager.approve_cp2(
        client_id=CLIENT_ID,
        reviewer="ops@sennen.io",
        reviewer_notes="Reviewed in CP2 dry-run session.",
        db=seeded_db,
    )
    assert state.status == CP2Status.APPROVED
    assert state.approved_at is not None
    assert state.blockers == []


def test_gate_blocks_before_approval(seeded_db) -> None:
    state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    with pytest.raises(CP2NotApprovedError):
        assert_cp2_approved(CLIENT_ID, seeded_db)


def test_gate_passes_after_approval(seeded_db) -> None:
    _approve_everything(seeded_db)
    state_manager.approve_cp2(
        client_id=CLIENT_ID,
        reviewer="ops@sennen.io",
        db=seeded_db,
    )
    assert_cp2_approved(CLIENT_ID, seeded_db)  # should not raise


def test_gate_raises_when_no_review_exists(db_session) -> None:
    with pytest.raises(CP2NotApprovedError, match="not been opened"):
        assert_cp2_approved(CLIENT_ID, db_session)


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

def test_audit_log_records_every_mutation(seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    state_manager.review_claim(
        client_id=CLIENT_ID,
        claim_id=str(state.inferred_claims_review[0].claim_id),
        decision=ReviewDecision.APPROVED,
        reviewer="ops@sennen.io",
        db=seeded_db,
    )
    log = state_manager.get_audit_log(CLIENT_ID, seeded_db)
    actions = [row["action"] for row in log]
    assert "OPEN_REVIEW" in actions
    assert "REVIEW_CLAIM_APPROVED" in actions


# ---------------------------------------------------------------------------
# API smoke tests
# ---------------------------------------------------------------------------

def test_get_endpoint_lazily_opens_review(test_client, seeded_db) -> None:
    response = test_client.get(f"/api/checkpoint-2?client_id={CLIENT_ID}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "IN_REVIEW"
    assert body["aggregate_progress"]["total_inferred_claims"] == 7


def test_patch_claim_endpoint_round_trip(test_client, seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    claim_id = str(state.inferred_claims_review[0].claim_id)
    response = test_client.patch(
        f"/api/checkpoint-2/claims/{claim_id}?client_id={CLIENT_ID}",
        json={"decision": "APPROVED", "reviewer": "ops@sennen.io"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["aggregate_progress"]["approved_claims"] == 1


def test_patch_claim_corrected_without_text_returns_422(test_client, seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    claim_id = str(state.inferred_claims_review[0].claim_id)
    response = test_client.patch(
        f"/api/checkpoint-2/claims/{claim_id}?client_id={CLIENT_ID}",
        json={"decision": "CORRECTED"},
    )
    assert response.status_code == 422


def test_approve_endpoint_returns_409_with_blockers(test_client, seeded_db) -> None:
    state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    response = test_client.post(
        f"/api/checkpoint-2/approve?client_id={CLIENT_ID}",
        json={"reviewer": "ops@sennen.io"},
    )
    assert response.status_code == 409
    payload = response.json()["detail"]
    assert "state" in payload
    assert any(
        b["type"] == "UNREVIEWED_CLAIMS"
        for b in payload["state"]["blockers"]
    )


def test_approve_endpoint_succeeds_after_full_review(test_client, seeded_db) -> None:
    _approve_everything(seeded_db)
    response = test_client.post(
        f"/api/checkpoint-2/approve?client_id={CLIENT_ID}",
        json={"reviewer": "ops@sennen.io", "reviewer_notes": "Done in 30 min."},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "APPROVED"


def test_remove_account_endpoint(test_client, seeded_db) -> None:
    state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    response = test_client.post(
        f"/api/checkpoint-2/accounts/beta.io/remove?client_id={CLIENT_ID}",
        json={"reason": "Out of ICP after review", "reviewer": "ops@sennen.io"},
    )
    assert response.status_code == 200
    body = response.json()
    beta = next(a for a in body["account_approvals"] if a["account_domain"] == "beta.io")
    assert beta["account_decision"] == "REMOVED_FROM_PIPELINE"


def test_audit_endpoint_returns_chronological_history(test_client, seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    state_manager.review_claim(
        client_id=CLIENT_ID,
        claim_id=str(state.inferred_claims_review[0].claim_id),
        decision=ReviewDecision.APPROVED,
        reviewer="ops@sennen.io",
        db=seeded_db,
    )
    response = test_client.get(f"/api/checkpoint-2/audit?client_id={CLIENT_ID}")
    assert response.status_code == 200
    rows = response.json()
    actions = [row["action"] for row in rows]
    assert actions[0] == "OPEN_REVIEW"
    assert "REVIEW_CLAIM_APPROVED" in actions


# ---------------------------------------------------------------------------
# Invariants module direct tests
# ---------------------------------------------------------------------------

def test_compute_blockers_includes_missing_reviewer(seeded_db) -> None:
    state = state_manager.open_review(CLIENT_ID, "ops@sennen.io", seeded_db)
    naked = state.model_copy(update={"reviewer": ""})
    blocker_types = {b.type for b in compute_blockers(naked)}
    assert CP2BlockerType.MISSING_REVIEWER in blocker_types
