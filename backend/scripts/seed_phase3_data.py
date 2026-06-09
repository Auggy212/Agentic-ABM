"""Seed a small Phase 3 demo: verification, recent-activity stubs, and CP2."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from backend.agents.cp2 import state_manager
from backend.agents.recent_activity.agent import RecentActivityAgent
from backend.agents.verifier.agent import VerifierAgent
from backend.agents.verifier.url_checker import UrlCheckResult
from backend.db.models import BuyerProfileRecord, SignalReportRecord
from backend.db.session import SessionLocal, create_tables
from backend.schemas.models import (
    AccountTier,
    BuyerIntelMeta,
    BuyerIntelPackage,
    BuyerProfile,
    BuyerSource,
    BuyingStage,
    BuyingStageMethod,
    CommitteeRole,
    EmailEngineResult,
    EmailFinalStatus,
    EmailStatus,
    EmailVerification,
    EngineName,
    EvidenceStatus,
    GeneratedBy,
    InferredPainPoint,
    IntelInferredPainPoint,
    IntelReport,
    RelookupSource,
    Seniority,
    SignalReport,
    SignalScore,
    StrategicPriority,
)

CLIENT_ID = "12345678-1234-5678-1234-567812345678"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _engine(status: EmailFinalStatus) -> EmailEngineResult:
    return EmailEngineResult(status=status, confidence=0.95, sub_status="", checked_at=_now())


class SeedEmailVerifier:
    neverbounce_used_this_run = 0
    zerobounce_used_this_run = 0
    relookup_service = type("Relookup", (), {"used_this_run": 1})()

    async def verify_email(self, email: str, **_kwargs) -> EmailVerification:
        self.neverbounce_used_this_run += 1
        if email.startswith("catchall"):
            self.zerobounce_used_this_run += 1
            return EmailVerification(
                email=email,
                status=EmailFinalStatus.CATCH_ALL,
                primary_engine=EngineName.NEVERBOUNCE,
                secondary_engine=EngineName.ZEROBOUNCE,
                primary_result=_engine(EmailFinalStatus.CATCH_ALL),
                secondary_result=_engine(EmailFinalStatus.VALID),
                relookup_attempted=False,
                relookup_source=None,
                relookup_email=None,
                relookup_blocked_reason=None,
                final_status=EmailFinalStatus.VALID,
            )
        if email.startswith("invalid"):
            return EmailVerification(
                email=email,
                status=EmailFinalStatus.INVALID,
                primary_engine=EngineName.NEVERBOUNCE,
                secondary_engine=None,
                primary_result=_engine(EmailFinalStatus.INVALID),
                secondary_result=None,
                relookup_attempted=True,
                relookup_source=RelookupSource.HUNTER,
                relookup_email=f"verified.{email}",
                relookup_blocked_reason=None,
                final_status=EmailFinalStatus.VALID,
            )
        return EmailVerification(
            email=email,
            status=EmailFinalStatus.VALID,
            primary_engine=EngineName.NEVERBOUNCE,
            secondary_engine=None,
            primary_result=_engine(EmailFinalStatus.VALID),
            secondary_result=None,
            relookup_attempted=False,
            relookup_source=None,
            relookup_email=None,
            relookup_blocked_reason=None,
            final_status=EmailFinalStatus.VALID,
        )

    def drain_warnings(self) -> list[str]:
        return []


def _profile(index: int, email: str) -> BuyerProfile:
    return BuyerProfile(
        contact_id=uuid.uuid5(uuid.NAMESPACE_DNS, f"phase3-contact-{index}"),
        account_domain="acme.in",
        full_name=f"Demo Buyer {index}",
        first_name="Demo",
        last_name=f"Buyer{index}",
        current_title="VP Sales",
        apollo_title="VP Sales",
        title_mismatch_flag=index % 3 == 0,
        seniority=Seniority.VP,
        department="Sales",
        email=email,
        email_status=EmailStatus.UNVERIFIED,
        phone=None,
        linkedin_url=f"https://linkedin.com/in/demo-buyer-{index}",
        tenure_current_role_months=4,
        tenure_current_company_months=18,
        past_experience=[],
        recent_activity=[],
        job_change_signal=True,
        committee_role=CommitteeRole.DECISION_MAKER if index == 1 else CommitteeRole.CHAMPION,
        committee_role_confidence=0.82,
        committee_role_reasoning="Seeded Phase 3 buyer persona.",
        inferred_pain_points=[
            InferredPainPoint(
                pain_point="[INFERRED] Pipeline reporting is manual",
                source="seed",
                confidence=0.72,
            )
        ],
        source=BuyerSource.APOLLO,
        enriched_at=_now(),
    )


def _package(profiles: list[BuyerProfile]) -> BuyerIntelPackage:
    return BuyerIntelPackage(
        client_id=uuid.UUID(CLIENT_ID),
        generated_at=_now(),
        accounts={"acme.in": profiles},
        meta=BuyerIntelMeta(
            total_accounts_processed=1,
            total_contacts_found=len(profiles),
            contacts_per_account_avg=float(len(profiles)),
            hunter_quota_used=0,
            apollo_quota_used=1,
            mismatches_flagged=sum(1 for p in profiles if p.title_mismatch_flag),
        ),
    )


def _signal_report() -> SignalReport:
    return SignalReport(
        account_domain="acme.in",
        tier=AccountTier.TIER_1,
        signals=[],
        signal_score=SignalScore(high_count=0, medium_count=0, low_count=0, total_score=0),
        buying_stage=BuyingStage.EVALUATING,
        buying_stage_method=BuyingStageMethod.RULES,
        buying_stage_reasoning="Seeded Phase 3 account.",
        recommended_outreach_approach="Lead with verified pipeline-quality proof.",
        intel_report=IntelReport(
            company_snapshot="[VERIFIED] Acme is a demo account. [INFERRED] GTM is scaling.",
            strategic_priorities=[
                StrategicPriority(
                    priority="Improve outbound quality",
                    evidence="Seeded inferred priority",
                    evidence_status=EvidenceStatus.INFERRED,
                    source_url="not_found",
                )
            ],
            tech_stack=["HubSpot"],
            competitive_landscape=[],
            inferred_pain_points=[
                IntelInferredPainPoint(
                    pain_point="Manual account research",
                    evidence_status=EvidenceStatus.INFERRED,
                    reasoning="Seeded for CP2 dry run.",
                )
            ],
            recent_news=[],
            buying_committee_summary="Seeded buyer committee.",
            recommended_angle="Use CP2-approved claims only.",
            generated_by=GeneratedBy(researcher="seed", synthesizer="seed"),
            generated_at=_now(),
        ),
    )


def _upsert_phase2_inputs(profiles: list[BuyerProfile]) -> None:
    db = SessionLocal()
    try:
        for profile in profiles:
            existing = (
                db.query(BuyerProfileRecord)
                .filter(BuyerProfileRecord.contact_id == str(profile.contact_id))
                .first()
            )
            payload = profile.model_dump(mode="json")
            if existing:
                existing.data = payload
            else:
                db.add(
                    BuyerProfileRecord(
                        client_id=CLIENT_ID,
                        account_domain=profile.account_domain,
                        contact_id=str(profile.contact_id),
                        committee_role=profile.committee_role.value,
                        source=profile.source.value,
                        data=payload,
                    )
                )
        report = _signal_report()
        existing_report = (
            db.query(SignalReportRecord)
            .filter(
                SignalReportRecord.client_id == CLIENT_ID,
                SignalReportRecord.account_domain == report.account_domain,
            )
            .first()
        )
        payload = report.model_dump(mode="json")
        if existing_report:
            existing_report.data = payload
        else:
            db.add(
                SignalReportRecord(
                    client_id=CLIENT_ID,
                    account_domain=report.account_domain,
                    data=payload,
                    buying_stage=report.buying_stage.value,
                    has_intel_report=True,
                )
            )
        db.commit()
    finally:
        db.close()


async def main() -> None:
    create_tables()
    profiles = [
        _profile(1, "valid.one@acme.in"),
        _profile(2, "catchall.two@acme.in"),
        _profile(3, "invalid.three@acme.in"),
        _profile(4, "valid.four@acme.in"),
    ]
    _upsert_phase2_inputs(profiles)

    package = _package(profiles)
    def fake_url_checker(url: str) -> UrlCheckResult:
        return UrlCheckResult(url=url, reachable=True, http_status=200, checked_at=_now())

    await VerifierAgent(
        email_verifier=SeedEmailVerifier(),
        url_checker=fake_url_checker,
    ).run(CLIENT_ID, package)
    await RecentActivityAgent().run(CLIENT_ID, package)

    db = SessionLocal()
    try:
        try:
            state_manager.open_review(CLIENT_ID, "ops@sennen.io", db)
        except state_manager.CP2StateError:
            pass
    finally:
        db.close()

    print("Seeded Phase 3.")
    print("Visit http://localhost:5173/verification and http://localhost:5173/checkpoint-2")


if __name__ == "__main__":
    asyncio.run(main())
