"""
Phase 2 seed script — extends Phase 1 seed data with buyer profiles and signal reports.

Usage:
    python -m backend.scripts.seed_phase2_data

What it seeds (no real API calls):
  - Buyer profiles (3–5 contacts per Tier 1 + Tier 2 account)
  - Signal reports (2–6 signals per account, covering all 5 buying stages)
  - Full IntelReports for 5 Tier 1 accounts (mock data, no Perplexity/Claude calls)
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

# Allow running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.agents.signal_intel.sources.mock import make_mock_signals
from backend.db.models import (
    BuyerIntelRunRecord,
    BuyerProfileRecord,
    ICPAccountRecord,
    MasterContextRecord,
    SignalIntelRunRecord,
    SignalReportRecord,
)
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
    CompetitiveLandscapeEntry,
    EmailStatus,
    EvidenceStatus,
    GeneratedBy,
    ICPAccount,
    IntelInferredPainPoint,
    IntelReport,
    InferredPainPoint,
    MasterContext,
    RecentNewsItem,
    Seniority,
    SignalReport,
    SignalScore,
    StrategicPriority,
)

# ---------------------------------------------------------------------------
# Mock persona pool (Indian SaaS names)
# ---------------------------------------------------------------------------

PERSONAS = [
    ("Priya Menon", "Chief Revenue Officer", "C_SUITE", "Revenue", "DECISION_MAKER", 0.95),
    ("Arjun Sharma", "VP of Sales", "VP", "Sales", "CHAMPION", 0.70),
    ("Nandini Krishnan", "Head of Sales Enablement", "DIRECTOR", "Sales", "CHAMPION", 0.70),
    ("Vikram Patel", "Director of Finance", "DIRECTOR", "Finance", "BLOCKER", 0.70),
    ("Sonal Gupta", "Senior Marketing Manager", "MANAGER", "Marketing", "INFLUENCER", 0.40),
    ("Rahul Verma", "CEO", "C_SUITE", "Executive", "DECISION_MAKER", 0.95),
    ("Deepa Nair", "VP Marketing", "VP", "Marketing", "CHAMPION", 0.70),
    ("Kavitha Subramaniam", "CTO", "C_SUITE", "Technology", "DECISION_MAKER", 0.95),
    ("Rohan Desai", "Sales Manager", "MANAGER", "Sales", "CHAMPION", 0.70),
    ("Meera Iyer", "COO", "C_SUITE", "Operations", "DECISION_MAKER", 0.95),
    ("Sneha Pillai", "VP Revenue Operations", "VP", "Revenue Operations", "DECISION_MAKER", 0.70),
    ("Kiran Bhat", "Director of Sales Development", "DIRECTOR", "Sales", "CHAMPION", 0.70),
    ("Anil Kumar", "Head of IT Security", "DIRECTOR", "IT Security", "BLOCKER", 0.70),
    ("Ananya Singh", "Marketing Operations Manager", "MANAGER", "Marketing", "INFLUENCER", 0.40),
    ("Rajesh Nambiar", "Chief Marketing Officer", "C_SUITE", "Marketing", "DECISION_MAKER", 0.95),
]

STAGE_OVERRIDES: dict[str, BuyingStage] = {
    "acme.com": BuyingStage.READY_TO_BUY,
    "techcorp.com": BuyingStage.EVALUATING,
    "saasco.com": BuyingStage.SOLUTION_AWARE,
    "growthco.com": BuyingStage.PROBLEM_AWARE,
    "startup.com": BuyingStage.UNAWARE,
}


def make_buyer_profile(
    account_domain: str,
    client_id: str,
    persona_idx: int,
    job_change: bool = False,
    title_mismatch: bool = False,
) -> BuyerProfile:
    full_name, title, seniority_str, dept, role_str, confidence = PERSONAS[persona_idx % len(PERSONAS)]
    first, last = full_name.split(" ", 1)

    apollo_title = title if not title_mismatch else (
        title.replace("VP", "Director").replace("Chief", "Head of").replace("Head of", "Director")
    )

    tenure_role = 4 if job_change else (18 + persona_idx * 3)

    return BuyerProfile(
        contact_id=uuid.uuid5(uuid.NAMESPACE_DNS, f"{account_domain}:{full_name}"),
        account_domain=account_domain,
        full_name=full_name,
        first_name=first,
        last_name=last,
        current_title=title,
        apollo_title=apollo_title,
        title_mismatch_flag=title_mismatch,
        seniority=Seniority(seniority_str),
        department=dept,
        email=f"{first.lower()}.{last.lower().replace(' ', '')}@{account_domain}",
        email_status=EmailStatus.VALID if persona_idx % 3 != 2 else EmailStatus.UNVERIFIED,
        phone=f"+91-9876{persona_idx:05d}" if role_str == "DECISION_MAKER" else None,
        linkedin_url=f"https://linkedin.com/in/{first.lower()}-{last.lower().replace(' ', '-')}",
        tenure_current_role_months=tenure_role,
        tenure_current_company_months=tenure_role + 18,
        past_experience=[],
        recent_activity=[],
        job_change_signal=job_change,
        committee_role=CommitteeRole(role_str),
        committee_role_confidence=confidence,
        committee_role_reasoning=f"Auto-assigned by seed script: {role_str}",
        inferred_pain_points=[
            InferredPainPoint(
                pain_point="[INFERRED] manual prospecting overhead",
                source="title_alignment",
                confidence=0.6,
            )
        ],
        source=BuyerSource.APOLLO,
        enriched_at=datetime.now(timezone.utc),
    )


def make_intel_report(company_name: str, domain: str) -> IntelReport:
    return IntelReport(
        company_snapshot=(
            f"[VERIFIED] {company_name} is a B2B SaaS company operating in the revenue intelligence space. "
            f"[VERIFIED] The company raised a Series B round in early 2026 according to Crunchbase. "
            f"[INFERRED] Based on recent hiring patterns, they appear to be scaling a mid-market GTM motion."
        ),
        strategic_priorities=[
            StrategicPriority(
                priority="Scale outbound sales motion with new SDR hires",
                evidence="[VERIFIED] 5 SDR roles posted on LinkedIn in the last 60 days.",
                evidence_status=EvidenceStatus.VERIFIED,
                source_url=f"https://linkedin.com/jobs/search/?company={domain}",
            ),
            StrategicPriority(
                priority="Expand into APAC and EMEA markets",
                evidence="[INFERRED] Regional leadership hires and office announcements suggest expansion.",
                evidence_status=EvidenceStatus.INFERRED,
                source_url="not_found",
            ),
        ],
        tech_stack=["Salesforce", "HubSpot", "Outreach", "Gong", "Slack"],
        competitive_landscape=[
            CompetitiveLandscapeEntry(
                competitor_name="CompetitorX",
                evidence="[VERIFIED] G2 review left by company employee comparing CompetitorX to alternatives.",
                evidence_status=EvidenceStatus.VERIFIED,
                source_url="https://www.g2.com/products/competitorx",
            ),
        ],
        inferred_pain_points=[
            IntelInferredPainPoint(
                pain_point="Low outbound conversion rate",
                evidence_status=EvidenceStatus.INFERRED,
                reasoning="VP Sales title + active SDR hiring signals conversion rate pressure.",
            ),
        ],
        recent_news=[
            RecentNewsItem(
                headline=f"{company_name} raises Series B to accelerate GTM",
                date=date(2026, 3, 15),
                source_url=f"https://techcrunch.com/{domain.replace('.', '-')}-series-b",
                summary="Company closes $40M Series B led by Accel to scale sales and product.",
            ),
        ],
        buying_committee_summary=f"The buying committee at {company_name} is led by the CRO with support from VP Sales.",
        recommended_angle=(
            "Lead with the Series B mandate to build a scalable outbound motion. Show ROI within Q1 — "
            "tie the pitch to the CRO's stated priority of reducing prospecting overhead."
        ),
        generated_by=GeneratedBy(researcher="perplexity", synthesizer="claude-sonnet-4"),
        generated_at=datetime.now(timezone.utc),
    )


def seed(client_id: str | None = None) -> None:
    create_tables()
    db = SessionLocal()

    try:
        # ── Find or create a demo client ─────────────────────────────────────
        mc_record = db.query(MasterContextRecord).first()
        if not mc_record:
            print("No MasterContext found — run Phase 1 seed first or submit intake.")
            return

        client_id = client_id or mc_record.client_id
        print(f"Seeding Phase 2 data for client_id={client_id}")

        # Load master context
        mc = MasterContext.model_validate(mc_record.data)

        # ── Load active ICP accounts ─────────────────────────────────────────
        account_records = (
            db.query(ICPAccountRecord)
            .filter(
                ICPAccountRecord.client_id == client_id,
                ICPAccountRecord.is_removed == False,  # noqa: E712
            )
            .all()
        )

        if not account_records:
            print("No active ICP accounts found — run /api/accounts/discover first.")
            return

        accounts = [ICPAccount.model_validate(r.data) for r in account_records]
        print(f"Found {len(accounts)} accounts to seed")

        tier1_intel_count = 0

        for account in accounts:
            domain = account.domain
            tier = account.tier
            company_name = account.company_name

            # ── Buyer profiles ────────────────────────────────────────────────
            n_contacts = 5 if tier == AccountTier.TIER_1 else 3 if tier == AccountTier.TIER_2 else 1
            profiles = []

            for i in range(n_contacts):
                job_change = i == 2  # 1 in 3 has job change signal (~33%)
                mismatch = i == 1   # 1 in 5 has title mismatch (~20%)
                profile = make_buyer_profile(domain, client_id, i, job_change=job_change, title_mismatch=mismatch)
                profiles.append(profile)

                contact_id_str = str(profile.contact_id)
                existing = db.query(BuyerProfileRecord).filter(
                    BuyerProfileRecord.contact_id == contact_id_str
                ).first()
                profile_dict = profile.model_dump(mode="json")

                if existing:
                    existing.data = profile_dict
                    existing.committee_role = profile.committee_role.value
                    existing.updated_at = datetime.now(timezone.utc)
                else:
                    db.add(BuyerProfileRecord(
                        client_id=client_id,
                        account_domain=domain,
                        contact_id=contact_id_str,
                        committee_role=profile.committee_role.value,
                        source=profile.source.value,
                        data=profile_dict,
                    ))

            # ── Signal reports ────────────────────────────────────────────────
            signals = make_mock_signals(domain, tier, mc)

            # Force a variety of buying stages
            if domain in STAGE_OVERRIDES:
                override_stage = STAGE_OVERRIDES[domain]
            else:
                hash_val = hash(domain) % 5
                stages = list(BuyingStage)
                override_stage = stages[hash_val]

            score = SignalScore(
                high_count=sum(1 for s in signals if s.intent_level.value == "HIGH"),
                medium_count=sum(1 for s in signals if s.intent_level.value == "MEDIUM"),
                low_count=sum(1 for s in signals if s.intent_level.value == "LOW"),
                total_score=sum(
                    10 if s.intent_level.value == "HIGH" else 4 if s.intent_level.value == "MEDIUM" else 1
                    for s in signals
                ),
            )

            # Intel report for first 5 Tier 1 accounts only
            intel_report = None
            if tier == AccountTier.TIER_1 and tier1_intel_count < 5:
                intel_report = make_intel_report(company_name, domain)
                tier1_intel_count += 1

            from backend.agents.signal_intel.classifier import get_outreach_approach
            report = SignalReport(
                account_domain=domain,
                tier=tier,
                signals=signals,
                signal_score=score,
                buying_stage=override_stage,
                buying_stage_method=BuyingStageMethod.RULES,
                buying_stage_reasoning=f"Seed override — {override_stage.value}",
                recommended_outreach_approach=get_outreach_approach(override_stage),
                intel_report=intel_report,
            )

            report_dict = report.model_dump(mode="json")
            existing_report = db.query(SignalReportRecord).filter(
                SignalReportRecord.client_id == client_id,
                SignalReportRecord.account_domain == domain,
            ).first()

            if existing_report:
                existing_report.data = report_dict
                existing_report.buying_stage = override_stage.value
                existing_report.has_intel_report = intel_report is not None
                existing_report.updated_at = datetime.now(timezone.utc)
            else:
                db.add(SignalReportRecord(
                    id=str(uuid.uuid4()),
                    client_id=client_id,
                    account_domain=domain,
                    data=report_dict,
                    buying_stage=override_stage.value,
                    has_intel_report=intel_report is not None,
                ))

        # ── Run metadata ──────────────────────────────────────────────────────
        buyer_run = BuyerIntelRunRecord(
            id=str(uuid.uuid4()),
            client_id=client_id,
            started_at=datetime.now(timezone.utc) - timedelta(minutes=32),
            finished_at=datetime.now(timezone.utc),
            total_accounts=len(accounts),
            total_contacts=sum(5 if a.tier == AccountTier.TIER_1 else 3 if a.tier == AccountTier.TIER_2 else 1 for a in accounts),
            quota_warnings=None,
            pending_domains=None,
            status="complete",
        )
        db.add(buyer_run)

        signal_run = SignalIntelRunRecord(
            id=str(uuid.uuid4()),
            client_id=client_id,
            started_at=datetime.now(timezone.utc) - timedelta(minutes=45),
            finished_at=datetime.now(timezone.utc),
            total_accounts=len(accounts),
            quota_warnings=None,
            status="complete",
        )
        db.add(signal_run)

        db.commit()

        print(f"\n✓ Phase 2 seed complete!")
        print(f"  - {len(accounts)} accounts seeded with buyer profiles + signal reports")
        print(f"  - {tier1_intel_count} Tier 1 intel reports generated (mock data)")
        print(f"\nVisit: http://localhost:5173/accounts?client_id={client_id}")
        print("Click any Tier 1 account → Buyers and Signals tabs")
        print(f"\nPipeline status: http://localhost:5173/pipeline?client_id={client_id}")

    except Exception as exc:
        db.rollback()
        print(f"Seed failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
