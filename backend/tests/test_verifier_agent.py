"""
Tests for the Phase 3 Verifier Agent.

Run: pytest backend/tests/test_verifier_agent.py -v
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import pytest

from backend.agents.icp_scout.sources.quota_manager import QuotaExhaustedError
from backend.agents.verifier import email_verifier as email_module
from backend.agents.verifier import relookup as relookup_module
from backend.agents.verifier.agent import VerifierAgent
from backend.agents.verifier.email_verifier import EmailVerifier
from backend.agents.verifier.relookup import HunterRelookupService
from backend.agents.verifier.url_checker import UrlCheckResult, check_url
from backend.schemas.models import (
    BuyerIntelMeta,
    BuyerIntelPackage,
    BuyerProfile,
    CommitteeRole,
    EmailEngineResult,
    EmailFinalStatus,
    EmailVerification,
    EngineName,
    InferredPainPoint,
    RelookupSource,
    Seniority,
)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _engine_result(status: EmailFinalStatus) -> EmailEngineResult:
    return EmailEngineResult(
        status=status,
        confidence=0.95,
        sub_status="",
        checked_at=_now(),
    )


def _email_verification(
    email: str,
    status: EmailFinalStatus,
    *,
    relookup_attempted: bool = False,
    relookup_email: str | None = None,
) -> EmailVerification:
    return EmailVerification(
        email=email,
        status=status,
        primary_engine=EngineName.NEVERBOUNCE,
        secondary_engine=None,
        primary_result=_engine_result(status),
        secondary_result=None,
        relookup_attempted=relookup_attempted,
        relookup_source=RelookupSource.HUNTER if relookup_attempted else None,
        relookup_email=relookup_email,
        relookup_blocked_reason=None,
        final_status=status,
    )


def _profile(
    *,
    email: str,
    domain: str = "acme.in",
    source: str = "APOLLO",
    title_mismatch: bool = True,
) -> BuyerProfile:
    return BuyerProfile(
        contact_id=_uuid(),
        account_domain=domain,
        full_name="Priya Sharma",
        first_name="Priya",
        last_name="Sharma",
        current_title="VP of Sales",
        apollo_title="VP Sales",
        title_mismatch_flag=title_mismatch,
        seniority=Seniority.VP,
        department="Sales",
        email=email,
        email_status="UNVERIFIED",
        phone=None,
        linkedin_url="https://linkedin.com/in/priyasharma",
        tenure_current_role_months=4,
        tenure_current_company_months=12,
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
        source=source,
        enriched_at=_now(),
    )


def _package(profiles: list[BuyerProfile]) -> BuyerIntelPackage:
    accounts: dict[str, list[BuyerProfile]] = {}
    for profile in profiles:
        accounts.setdefault(profile.account_domain, []).append(profile)
    return BuyerIntelPackage(
        client_id=_uuid(),
        generated_at=_now(),
        accounts=accounts,
        meta=BuyerIntelMeta(
            total_accounts_processed=len(accounts),
            total_contacts_found=len(profiles),
            contacts_per_account_avg=len(profiles) / len(accounts),
            hunter_quota_used=0,
            apollo_quota_used=0,
            mismatches_flagged=sum(1 for p in profiles if p.title_mismatch_flag),
        ),
    )


class FakeUrlChecker:
    def __call__(self, url: str) -> UrlCheckResult:
        return UrlCheckResult(url=url, reachable=True, http_status=200, checked_at=_now())


class FakeEmailVerifier:
    def __init__(self, statuses: dict[str, EmailFinalStatus]) -> None:
        self.statuses = statuses
        self.neverbounce_used_this_run = 0
        self.zerobounce_used_this_run = 0
        self.relookup_service = type("Relookup", (), {"used_this_run": 0})()

    async def verify_email(self, email: str, **_kwargs) -> EmailVerification:
        self.neverbounce_used_this_run += 1
        status = self.statuses[email]
        return _email_verification(email, status)

    def drain_warnings(self) -> list[str]:
        return []


@pytest.mark.asyncio
async def test_valid_email_stage_a_only_no_zerobounce(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_module, "check_and_increment", lambda _source: 1)

    verifier = EmailVerifier(neverbounce_api_key="nb", zerobounce_api_key="zb")
    called = {"zerobounce": 0}

    async def fake_nb(_email: str) -> dict:
        return {"result": "valid", "confidence": 0.99}

    async def fake_zb(_email: str) -> dict:
        called["zerobounce"] += 1
        return {"status": "invalid"}

    monkeypatch.setattr(verifier, "_call_neverbounce", fake_nb)
    monkeypatch.setattr(verifier, "_call_zerobounce", fake_zb)

    result = await verifier.verify_email("priya@acme.in")

    assert result.final_status == EmailFinalStatus.VALID
    assert result.secondary_result is None
    assert called["zerobounce"] == 0


@pytest.mark.asyncio
async def test_catch_all_from_neverbounce_calls_zerobounce(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_module, "check_and_increment", lambda _source: 1)
    verifier = EmailVerifier(neverbounce_api_key="nb", zerobounce_api_key="zb")

    async def fake_nb(_email: str) -> dict:
        return {"result": "catchall"}

    async def fake_zb(_email: str) -> dict:
        return {"status": "valid", "confidence": 0.96}

    monkeypatch.setattr(verifier, "_call_neverbounce", fake_nb)
    monkeypatch.setattr(verifier, "_call_zerobounce", fake_zb)

    result = await verifier.verify_email("catchall@acme.in")

    assert result.primary_result.status == EmailFinalStatus.CATCH_ALL
    assert result.secondary_engine == EngineName.ZEROBOUNCE
    assert result.final_status == EmailFinalStatus.VALID


@pytest.mark.asyncio
async def test_invalid_email_hunter_relookup_gets_reverified(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_module, "check_and_increment", lambda _source: 1)
    monkeypatch.setattr(relookup_module, "check_and_increment", lambda _source: 1)
    monkeypatch.setattr(relookup_module, "get_usage", lambda _source: 0)

    relookup_service = HunterRelookupService(api_key="hunter")
    verifier = EmailVerifier(
        neverbounce_api_key="nb",
        zerobounce_api_key="zb",
        relookup_service=relookup_service,
    )
    nb_results = iter([{"result": "invalid"}, {"result": "valid"}])

    async def fake_nb(_email: str) -> dict:
        return next(nb_results)

    async def fake_hunter(**_kwargs) -> str:
        return "new.priya@acme.in"

    monkeypatch.setattr(verifier, "_call_neverbounce", fake_nb)
    monkeypatch.setattr(relookup_service, "_call_hunter", fake_hunter)

    result = await verifier.verify_email(
        "old.priya@acme.in",
        domain="acme.in",
        full_name="Priya Sharma",
    )

    assert result.relookup_attempted is True
    assert result.relookup_email == "new.priya@acme.in"
    assert result.final_status == EmailFinalStatus.VALID


def test_linkedin_url_999_is_reachable(monkeypatch: pytest.MonkeyPatch) -> None:
    class Response:
        status_code = 999

    monkeypatch.setattr(
        "backend.agents.verifier.url_checker.requests.head",
        lambda *_args, **_kwargs: Response(),
    )

    result = check_url("https://linkedin.com/in/priyasharma")
    assert result.http_status == 999
    assert result.reachable is True


@pytest.mark.asyncio
async def test_per_source_breakdown_and_diagnosis_lowest_source() -> None:
    profiles = [
        _profile(email="apollo1@acme.in", domain="acme.in", source="APOLLO"),
        _profile(email="apollo2@acme.in", domain="acme.in", source="APOLLO"),
        _profile(email="clay@beta.io", domain="beta.io", source="CLAY"),
        _profile(email="manual@gamma.io", domain="gamma.io", source="LINKEDIN_MANUAL"),
    ]
    fake_email = FakeEmailVerifier(
        {
            "apollo1@acme.in": EmailFinalStatus.INVALID,
            "apollo2@acme.in": EmailFinalStatus.INVALID,
            "clay@beta.io": EmailFinalStatus.VALID,
            "manual@gamma.io": EmailFinalStatus.VALID,
        }
    )
    agent = VerifierAgent(
        email_verifier=fake_email,
        url_checker=FakeUrlChecker(),
        persist_results=False,
    )

    package = await agent.run(str(_uuid()), _package(profiles))

    assert package.per_source_breakdown.apollo.total == 2
    assert package.per_source_breakdown.apollo.pass_rate == 0.0
    assert package.per_source_breakdown.clay.pass_rate == 1.0
    assert package.per_source_breakdown.linkedin_manual.pass_rate == 1.0
    assert package.aggregate.deliverability_rate == 0.5
    assert package.target_miss_diagnosis is not None
    assert "Lowest-quality source: apollo" in package.target_miss_diagnosis
    assert "Tighten ICP filters" in package.target_miss_diagnosis


@pytest.mark.asyncio
async def test_neverbounce_quota_exhausted_falls_back_to_zerobounce(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_quota(source: str) -> int:
        if source == "NEVERBOUNCE":
            raise QuotaExhaustedError("NEVERBOUNCE", 1000, 1000, date(2026, 5, 1))
        return 1

    monkeypatch.setattr(email_module, "check_and_increment", fake_quota)
    verifier = EmailVerifier(neverbounce_api_key="nb", zerobounce_api_key="zb")

    async def fake_zb(_email: str) -> dict:
        return {"status": "valid"}

    monkeypatch.setattr(verifier, "_call_zerobounce", fake_zb)

    result = await verifier.verify_email("fallback@acme.in")

    assert result.primary_engine == EngineName.ZEROBOUNCE
    assert result.final_status == EmailFinalStatus.VALID
    assert any("NeverBounce quota exhausted" in warning for warning in verifier.drain_warnings())


@pytest.mark.asyncio
async def test_title_reconciliation_fallback_adds_warning_issue() -> None:
    profile = _profile(email="priya@acme.in")
    agent = VerifierAgent(
        email_verifier=FakeEmailVerifier({"priya@acme.in": EmailFinalStatus.VALID}),
        url_checker=FakeUrlChecker(),
        persist_results=False,
    )

    package = await agent.run(str(_uuid()), _package([profile]))
    result = package.verifications[0]

    assert result.title_reconciliation.resolution_method.value == "APOLLO_FALLBACK"
    assert any(issue.code == "TITLE_RECONCILIATION_PENDING" for issue in result.issues)
