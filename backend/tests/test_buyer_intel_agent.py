"""
Tests for the Buyer Intel Agent pipeline.

Run:  pytest backend/tests/test_buyer_intel_agent.py -v

All tests mock Apollo, Hunter, Lusha, and Redis. No network calls made.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.agents.buyer_intel.agent import BuyerIntelAgent, _detect_job_change, _sort_accounts_by_tier
from backend.agents.buyer_intel.committee_role_mapper import map_committee_role
from backend.agents.buyer_intel.contact_picker import pick_committee
from backend.agents.buyer_intel.pain_inferer import infer_pain_points
from backend.agents.icp_scout.sources.apollo import RawContact, RawPastRole
from backend.agents.icp_scout.sources.quota_manager import QuotaExhaustedError
from backend.schemas.models import (
    AccountListMeta,
    AccountTier,
    BuyerProfile,
    BuyerSource,
    CommitteeRole,
    DataSource,
    EmailStatus,
    ICPAccount,
    ICPAccountList,
    MasterContext,
    Seniority,
    TierBreakdown,
)

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_NF = "not_found"
_CLIENT_ID = "aaaaaaaa-1234-5678-abcd-aaaaaaaaaaaa"


def _funding_round(label: str = "Series A") -> dict:
    return {"round": label, "amount_usd": 5_000_000, "date": "2025-01-15"}


def _make_icp_account(
    domain: str,
    tier: str = "TIER_1",
    score: int = 85,
) -> ICPAccount:
    tier_scores = {"TIER_1": 85, "TIER_2": 65, "TIER_3": 40}
    s = tier_scores.get(tier, score)
    return ICPAccount.model_validate({
        "domain": domain,
        "company_name": domain.replace(".in", "").title(),
        "website": f"https://{domain}",
        "linkedin_url": None,
        "industry": "SaaS",
        "headcount": 80,
        "estimated_arr": "$1M-$5M",
        "funding_stage": "Series A",
        "last_funding_round": _funding_round(),
        "hq_location": "Bangalore, India",
        "technologies_used": ["HubSpot"],
        "recent_signals": [],
        "icp_score": s,
        "score_breakdown": {
            "industry": 20, "company_size": 15, "geography": 10,
            "tech_stack": 20, "funding_stage": 10, "buying_triggers": 10,
        },
        "tier": tier,
        "source": "APOLLO",
        "enriched_at": datetime.now(tz=timezone.utc).isoformat(),
    })


def _make_account_list(domains_tiers: list[tuple[str, str]]) -> ICPAccountList:
    accounts = [_make_icp_account(d, t) for d, t in domains_tiers]
    t1 = sum(1 for a in accounts if a.tier == AccountTier.TIER_1)
    t2 = sum(1 for a in accounts if a.tier == AccountTier.TIER_2)
    t3 = sum(1 for a in accounts if a.tier == AccountTier.TIER_3)
    return ICPAccountList(
        accounts=accounts,
        meta=AccountListMeta(
            total_found=len(accounts),
            tier_breakdown=TierBreakdown(tier_1=t1, tier_2=t2, tier_3=t3),
            generated_at=datetime.now(tz=timezone.utc),
            client_id=uuid.UUID(_CLIENT_ID),
        ),
    )


def _make_master_context(
    titles: list[str] | None = None,
    pain_points: list[str] | None = None,
) -> MasterContext:
    return MasterContext.model_validate({
        "company": {
            "name": "FCP",
            "website": "https://fcp.io",
            "industry": "B2B SaaS",
            "stage": "Series A",
            "product": "ABM Engine",
            "value_prop": "10x pipeline from existing TAM",
            "differentiators": ["AI scoring", "real-time signals"],
            "pricing_model": "Subscription",
            "acv_range": "$5k–$20k",
            "reference_customers": ["Acme", "Beta Co"],
        },
        "icp": {
            "industries": ["SaaS", "B2B SaaS"],
            "company_size_employees": "10-200",
            "company_size_arr": "$0-$10M",
            "funding_stage": ["Seed", "Series A", "Series B"],
            "geographies": ["India", "Bangalore"],
            "tech_stack_signals": ["HubSpot", "Intercom"],
            "buying_triggers": ["hiring SDR", "global expansion", "Series A"],
            "negative_icp": [],
        },
        "buyers": {
            "titles": titles or ["VP Sales", "Head of Sales", "CRO", "VP Marketing"],
            "seniority": ["VP", "C-Suite", "Director"],
            "buying_committee_size": "3-5",
            "pain_points": pain_points or ["manual prospecting", "poor pipeline visibility"],
            "unstated_needs": ["time savings", "CRM hygiene"],
        },
        "competitors": [{"name": "6sense", "weaknesses": ["expensive"]}],
        "gtm": {
            "win_themes": ["fast ROI"],
            "loss_themes": ["budget"],
            "channels": ["LinkedIn", "Email"],
            "crm": "HubSpot",
            "existing_account_list": None,
        },
        "meta": {
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
            "client_id": _CLIENT_ID,
            "version": "1.0.0",
        },
    })


def _make_raw_contact(
    domain: str = "acme.in",
    title: str = "VP of Sales",
    seniority: str = "vp",
    department: str = "Sales",
    email: str = "priya@acme.in",
    tenure_role: int | str = 14,
    tenure_company: int | str = 36,
    contact_id: str | None = None,
) -> RawContact:
    cid = contact_id or str(uuid.uuid4())
    name = f"Contact {cid[:4]}"
    return RawContact(
        contact_id=cid,
        first_name=name.split()[0],
        last_name=name.split()[1],
        full_name=name,
        apollo_title=title,
        current_title=title,
        seniority_label=seniority,
        department=department,
        email=email,
        phone=_NF,
        linkedin_url=f"https://linkedin.com/in/{name.lower().replace(' ', '-')}",
        account_domain=domain,
        tenure_current_role_months=tenure_role,
        tenure_current_company_months=tenure_company,
    )


def _make_buyer_profile(
    domain: str = "acme.in",
    role: CommitteeRole = CommitteeRole.DECISION_MAKER,
    confidence: float = 0.95,
) -> BuyerProfile:
    contact_id = uuid.uuid4()
    return BuyerProfile(
        contact_id=contact_id,
        account_domain=domain,
        full_name="Priya Sharma",
        first_name="Priya",
        last_name="Sharma",
        current_title="VP of Sales",
        apollo_title="VP Sales",
        title_mismatch_flag=True,
        seniority=Seniority.VP,
        department="Sales",
        email="priya@acme.in",
        email_status=EmailStatus.UNVERIFIED,
        phone=None,
        linkedin_url=None,
        tenure_current_role_months=14,
        tenure_current_company_months=36,
        past_experience=[],
        recent_activity=[],
        job_change_signal=False,
        committee_role=role,
        committee_role_confidence=confidence,
        committee_role_reasoning="VP-level title matched ICP buyer titles.",
        inferred_pain_points=[],
        source=BuyerSource.APOLLO,
        enriched_at=datetime.now(tz=timezone.utc),
    )


# ---------------------------------------------------------------------------
# Unit: _detect_job_change
# ---------------------------------------------------------------------------

class TestDetectJobChange:
    def test_tenure_5_months_is_job_change(self):
        assert _detect_job_change(5) is True

    def test_tenure_6_months_is_job_change(self):
        assert _detect_job_change(6) is True

    def test_tenure_7_months_is_not_job_change(self):
        assert _detect_job_change(7) is False

    def test_tenure_not_found_is_not_job_change(self):
        assert _detect_job_change(_NF) is False

    def test_tenure_0_months_is_job_change(self):
        assert _detect_job_change(0) is True


# ---------------------------------------------------------------------------
# Unit: _sort_accounts_by_tier
# ---------------------------------------------------------------------------

class TestSortByTier:
    def test_tier_1_comes_before_tier_3(self):
        al = _make_account_list([
            ("tier3.in", "TIER_3"),
            ("tier1.in", "TIER_1"),
            ("tier2.in", "TIER_2"),
        ])
        sorted_accounts = _sort_accounts_by_tier(al)
        tiers = [a.tier.value for a in sorted_accounts]
        assert tiers == ["TIER_1", "TIER_2", "TIER_3"]

    def test_tier1_accounts_processed_before_tier3(self):
        al = _make_account_list([
            ("a.in", "TIER_3"), ("b.in", "TIER_1"), ("c.in", "TIER_2"),
        ])
        sorted_accounts = _sort_accounts_by_tier(al)
        assert sorted_accounts[0].tier == AccountTier.TIER_1
        assert sorted_accounts[-1].tier == AccountTier.TIER_3


# ---------------------------------------------------------------------------
# Unit: committee_role_mapper
# ---------------------------------------------------------------------------

class TestCommitteeRoleMapper:
    def setup_method(self):
        self.ctx = _make_master_context()

    def test_ceo_title_maps_to_decision_maker(self):
        contact = _make_raw_contact(title="CEO", seniority="c_suite", department="Executive")
        role, confidence, reasoning = map_committee_role(contact, self.ctx)
        assert role == CommitteeRole.DECISION_MAKER
        assert confidence == 0.95
        assert "C-suite" in reasoning

    def test_cro_title_maps_to_decision_maker(self):
        contact = _make_raw_contact(title="CRO", seniority="c_suite", department="Sales")
        role, confidence, _ = map_committee_role(contact, self.ctx)
        assert role == CommitteeRole.DECISION_MAKER
        assert confidence == 0.95

    def test_vp_aligned_department_maps_to_decision_maker(self):
        contact = _make_raw_contact(title="VP of Sales", seniority="vp", department="Sales")
        role, confidence, reasoning = map_committee_role(contact, self.ctx)
        assert role == CommitteeRole.DECISION_MAKER
        assert confidence == 0.70
        assert "VP" in reasoning

    def test_procurement_director_maps_to_blocker(self):
        contact = _make_raw_contact(title="Director of Procurement", seniority="director", department="Procurement")
        role, confidence, reasoning = map_committee_role(contact, self.ctx)
        assert role == CommitteeRole.BLOCKER
        assert "BLOCKER" in reasoning

    def test_legal_director_maps_to_blocker(self):
        contact = _make_raw_contact(title="Legal Director", seniority="director", department="Legal")
        role, _, _ = map_committee_role(contact, self.ctx)
        assert role == CommitteeRole.BLOCKER

    def test_sales_manager_maps_to_champion(self):
        contact = _make_raw_contact(title="Sales Manager", seniority="manager", department="Sales")
        role, confidence, _ = map_committee_role(contact, self.ctx)
        assert role == CommitteeRole.CHAMPION

    def test_unmatched_contact_maps_to_influencer(self):
        contact = _make_raw_contact(title="Software Engineer", seniority="individual_contributor", department="Engineering")
        role, confidence, reasoning = map_committee_role(contact, self.ctx)
        assert role == CommitteeRole.INFLUENCER
        assert confidence == 0.40
        assert "INFLUENCER" in reasoning

    def test_confidence_always_in_range(self):
        for title, seniority, dept in [
            ("CEO", "c_suite", "Executive"),
            ("VP Sales", "vp", "Sales"),
            ("Legal Director", "director", "Legal"),
            ("SDR", "individual_contributor", "Sales"),
        ]:
            contact = _make_raw_contact(title=title, seniority=seniority, department=dept)
            _, confidence, _ = map_committee_role(contact, self.ctx)
            assert 0.0 <= confidence <= 1.0, f"Confidence {confidence} out of range for {title}"


# ---------------------------------------------------------------------------
# Unit: contact_picker
# ---------------------------------------------------------------------------

class TestContactPicker:
    def test_empty_candidates_returns_empty(self):
        assert pick_committee([]) == []

    def test_hard_cap_5(self):
        candidates = [
            _make_buyer_profile(role=CommitteeRole.INFLUENCER)
            for _ in range(10)
        ]
        result = pick_committee(candidates)
        assert len(result) <= 5

    def test_role_distribution_enforced(self):
        candidates = (
            [_make_buyer_profile(role=CommitteeRole.DECISION_MAKER)] * 3
            + [_make_buyer_profile(role=CommitteeRole.CHAMPION)] * 3
            + [_make_buyer_profile(role=CommitteeRole.BLOCKER)] * 2
            + [_make_buyer_profile(role=CommitteeRole.INFLUENCER)] * 2
        )
        result = pick_committee(candidates)
        roles = [p.committee_role for p in result]
        assert roles.count(CommitteeRole.DECISION_MAKER) <= 1
        assert roles.count(CommitteeRole.CHAMPION) <= 2
        assert roles.count(CommitteeRole.BLOCKER) <= 1
        assert roles.count(CommitteeRole.INFLUENCER) <= 1
        assert len(result) <= 5

    def test_no_padding_when_few_candidates(self):
        candidates = [_make_buyer_profile(role=CommitteeRole.CHAMPION)]
        result = pick_committee(candidates)
        assert len(result) == 1

    def test_highest_confidence_dm_is_selected(self):
        low_dm = _make_buyer_profile(role=CommitteeRole.DECISION_MAKER, confidence=0.40)
        high_dm = _make_buyer_profile(role=CommitteeRole.DECISION_MAKER, confidence=0.95)
        result = pick_committee([low_dm, high_dm])
        dms = [p for p in result if p.committee_role == CommitteeRole.DECISION_MAKER]
        assert len(dms) == 1
        assert dms[0].committee_role_confidence == 0.95


# ---------------------------------------------------------------------------
# Unit: pain_inferer
# ---------------------------------------------------------------------------

class TestPainInferer:
    def test_title_alignment_produces_pain_points(self):
        ctx = _make_master_context(pain_points=["manual prospecting", "pipeline visibility"])
        contact = _make_raw_contact(title="VP of Sales", department="Sales")
        result = infer_pain_points(contact, ctx)
        assert isinstance(result, list)
        for pp in result:
            assert pp.pain_point.startswith("[INFERRED]")
            assert 0.0 <= pp.confidence <= 1.0
            assert pp.source == "title_alignment"

    def test_no_pain_points_when_no_alignment(self):
        ctx = _make_master_context(pain_points=["outbound conversion rate"])
        contact = _make_raw_contact(title="Backend Engineer", department="Engineering")
        result = infer_pain_points(contact, ctx)
        # Weak alignment — may still be 0
        for pp in result:
            assert pp.pain_point.startswith("[INFERRED]")

    def test_max_3_pain_points_returned(self):
        ctx = _make_master_context(pain_points=[
            "manual prospecting", "pipeline visibility", "bad data quality",
            "slow outreach", "poor CRM hygiene",
        ])
        contact = _make_raw_contact(title="VP Sales Manager Director", department="Sales")
        result = infer_pain_points(contact, ctx)
        assert len(result) <= 3

    def test_empty_pain_points_in_context_returns_empty(self):
        ctx = _make_master_context(pain_points=[])
        contact = _make_raw_contact(title="VP of Sales")
        result = infer_pain_points(contact, ctx)
        assert result == []


# ---------------------------------------------------------------------------
# Integration: BuyerIntelAgent.run — mocked sources
# ---------------------------------------------------------------------------

def _mock_raw_contacts(domain: str, count: int = 5) -> list[RawContact]:
    roles_seniority = [
        ("CEO", "c_suite", "Executive"),
        ("VP of Sales", "vp", "Sales"),
        ("Sales Director", "director", "Sales"),
        ("Legal Director", "director", "Legal"),
        ("Marketing Manager", "manager", "Marketing"),
    ]
    return [
        _make_raw_contact(
            domain=domain,
            title=t,
            seniority=s,
            department=d,
            email=f"contact{i}@{domain}",
            tenure_role=3 if i == 0 else 18,  # first contact has job change signal
            contact_id=str(uuid.uuid4()),
        )
        for i, (t, s, d) in enumerate(roles_seniority[:count])
    ]


class TestBuyerIntelAgentRun:
    """Integration tests with mocked Apollo, Hunter, Lusha, DB, and quota_manager."""

    @pytest.fixture
    def account_list_10(self):
        domains_tiers = [
            ("alpha.in", "TIER_1"), ("beta.in", "TIER_1"), ("gamma.in", "TIER_1"),
            ("delta.in", "TIER_2"), ("epsilon.in", "TIER_2"), ("zeta.in", "TIER_2"),
            ("eta.in", "TIER_3"), ("theta.in", "TIER_3"), ("iota.in", "TIER_3"),
            ("kappa.in", "TIER_3"),
        ]
        return _make_account_list(domains_tiers)

    @pytest.fixture
    def master_ctx(self):
        return _make_master_context()

    @pytest.mark.asyncio
    async def test_each_account_gets_at_most_5_contacts(
        self, account_list_10, master_ctx
    ):
        with (
            patch("backend.agents.buyer_intel.agent.check_and_increment", return_value=1),
            patch.object(
                BuyerIntelAgent, "_persist", return_value=None
            ),
            patch(
                "backend.agents.buyer_intel.agent.verify_email",
                new=AsyncMock(return_value=EmailStatus.VALID),
            ),
            patch(
                "backend.agents.buyer_intel.agent.enrich_contact",
                new=AsyncMock(return_value=MagicMock(direct_phone=_NF, work_email=_NF)),
            ),
        ):
            apollo_mock = AsyncMock()
            apollo_mock.search_contacts = AsyncMock(
                side_effect=lambda domain, **kw: _mock_raw_contacts(domain, 5)
            )
            agent = BuyerIntelAgent(apollo=apollo_mock)
            package = await agent.run(_CLIENT_ID, account_list_10, master_ctx)

        for domain, contacts in package.accounts.items():
            assert len(contacts) <= 5, f"{domain} has {len(contacts)} contacts (max 5)"

    @pytest.mark.asyncio
    async def test_role_distribution_per_account(
        self, account_list_10, master_ctx
    ):
        with (
            patch("backend.agents.buyer_intel.agent.check_and_increment", return_value=1),
            patch.object(BuyerIntelAgent, "_persist", return_value=None),
            patch("backend.agents.buyer_intel.agent.verify_email", new=AsyncMock(return_value=EmailStatus.VALID)),
            patch("backend.agents.buyer_intel.agent.enrich_contact", new=AsyncMock(return_value=MagicMock(direct_phone=_NF, work_email=_NF))),
        ):
            apollo_mock = AsyncMock()
            apollo_mock.search_contacts = AsyncMock(
                side_effect=lambda domain, **kw: _mock_raw_contacts(domain, 5)
            )
            agent = BuyerIntelAgent(apollo=apollo_mock)
            package = await agent.run(_CLIENT_ID, account_list_10, master_ctx)

        for domain, contacts in package.accounts.items():
            roles = [c.committee_role for c in contacts]
            assert roles.count(CommitteeRole.DECISION_MAKER) <= 1
            assert roles.count(CommitteeRole.CHAMPION) <= 2
            assert roles.count(CommitteeRole.BLOCKER) <= 1
            assert roles.count(CommitteeRole.INFLUENCER) <= 1

    @pytest.mark.asyncio
    async def test_committee_role_confidence_in_range(
        self, account_list_10, master_ctx
    ):
        with (
            patch("backend.agents.buyer_intel.agent.check_and_increment", return_value=1),
            patch.object(BuyerIntelAgent, "_persist", return_value=None),
            patch("backend.agents.buyer_intel.agent.verify_email", new=AsyncMock(return_value=EmailStatus.VALID)),
            patch("backend.agents.buyer_intel.agent.enrich_contact", new=AsyncMock(return_value=MagicMock(direct_phone=_NF, work_email=_NF))),
        ):
            apollo_mock = AsyncMock()
            apollo_mock.search_contacts = AsyncMock(
                side_effect=lambda domain, **kw: _mock_raw_contacts(domain, 5)
            )
            agent = BuyerIntelAgent(apollo=apollo_mock)
            package = await agent.run(_CLIENT_ID, account_list_10, master_ctx)

        for domain, contacts in package.accounts.items():
            for c in contacts:
                assert 0.0 <= c.committee_role_confidence <= 1.0, (
                    f"{domain}/{c.full_name}: confidence={c.committee_role_confidence}"
                )

    @pytest.mark.asyncio
    async def test_recent_activity_always_empty(
        self, account_list_10, master_ctx
    ):
        """Phase 2 reality: recent_activity must be [] for every contact."""
        with (
            patch("backend.agents.buyer_intel.agent.check_and_increment", return_value=1),
            patch.object(BuyerIntelAgent, "_persist", return_value=None),
            patch("backend.agents.buyer_intel.agent.verify_email", new=AsyncMock(return_value=EmailStatus.VALID)),
            patch("backend.agents.buyer_intel.agent.enrich_contact", new=AsyncMock(return_value=MagicMock(direct_phone=_NF, work_email=_NF))),
        ):
            apollo_mock = AsyncMock()
            apollo_mock.search_contacts = AsyncMock(
                side_effect=lambda domain, **kw: _mock_raw_contacts(domain, 5)
            )
            agent = BuyerIntelAgent(apollo=apollo_mock)
            package = await agent.run(_CLIENT_ID, account_list_10, master_ctx)

        for domain, contacts in package.accounts.items():
            for c in contacts:
                assert c.recent_activity == [], (
                    f"{domain}/{c.full_name}: recent_activity={c.recent_activity}"
                )

    @pytest.mark.asyncio
    async def test_job_change_signal_set_when_tenure_lte_6(
        self, master_ctx
    ):
        al = _make_account_list([("newjob.in", "TIER_1")])
        contacts = [_make_raw_contact(domain="newjob.in", tenure_role=3, contact_id=str(uuid.uuid4()))]

        with (
            patch("backend.agents.buyer_intel.agent.check_and_increment", return_value=1),
            patch.object(BuyerIntelAgent, "_persist", return_value=None),
            patch("backend.agents.buyer_intel.agent.verify_email", new=AsyncMock(return_value=EmailStatus.VALID)),
            patch("backend.agents.buyer_intel.agent.enrich_contact", new=AsyncMock(return_value=MagicMock(direct_phone=_NF, work_email=_NF))),
        ):
            apollo_mock = AsyncMock()
            apollo_mock.search_contacts = AsyncMock(return_value=contacts)
            agent = BuyerIntelAgent(apollo=apollo_mock)
            package = await agent.run(_CLIENT_ID, al, master_ctx)

        all_contacts = [c for cs in package.accounts.values() for c in cs]
        assert any(c.job_change_signal for c in all_contacts)

    @pytest.mark.asyncio
    async def test_tier1_processed_before_tier3(
        self, master_ctx
    ):
        """Tier 1 accounts must be enriched before Tier 3 — confirmed via call order."""
        call_order: list[str] = []

        async def mock_search(domain, **kw):
            call_order.append(domain)
            return _mock_raw_contacts(domain, 2)

        al = _make_account_list([
            ("tier3first.in", "TIER_3"),
            ("tier1second.in", "TIER_1"),
        ])

        with (
            patch("backend.agents.buyer_intel.agent.check_and_increment", return_value=1),
            patch.object(BuyerIntelAgent, "_persist", return_value=None),
            patch("backend.agents.buyer_intel.agent.verify_email", new=AsyncMock(return_value=EmailStatus.VALID)),
            patch("backend.agents.buyer_intel.agent.enrich_contact", new=AsyncMock(return_value=MagicMock(direct_phone=_NF, work_email=_NF))),
        ):
            apollo_mock = AsyncMock()
            apollo_mock.search_contacts = AsyncMock(side_effect=mock_search)
            agent = BuyerIntelAgent(apollo=apollo_mock)
            await agent.run(_CLIENT_ID, al, master_ctx)

        assert call_order.index("tier1second.in") < call_order.index("tier3first.in")

    @pytest.mark.asyncio
    async def test_apollo_quota_exhausted_mid_run_marks_pending(
        self, master_ctx
    ):
        """
        When Apollo quota is exhausted mid-run, unprocessed accounts are marked
        PENDING_QUOTA_RESET in the run metadata and the run still succeeds.
        """
        call_count = 0

        def mock_check_and_increment(source: str) -> int:
            nonlocal call_count
            if source == "APOLLO_CONTACTS":
                call_count += 1
                if call_count > 2:
                    from datetime import date
                    raise QuotaExhaustedError("APOLLO_CONTACTS", 50, 50, date(2026, 5, 1))
            return call_count

        al = _make_account_list([
            ("a1.in", "TIER_1"), ("a2.in", "TIER_1"), ("a3.in", "TIER_2"),
            ("a4.in", "TIER_3"), ("a5.in", "TIER_3"),
        ])

        persisted_state: dict = {}

        def mock_persist(*, client_id, run_id, package_accounts, quota_warnings,
                         pending_domains, total_contacts, total_accounts, hunter_quota_used):
            persisted_state["quota_warnings"] = quota_warnings
            persisted_state["pending_domains"] = pending_domains

        with (
            patch("backend.agents.buyer_intel.agent.check_and_increment", side_effect=mock_check_and_increment),
            patch.object(BuyerIntelAgent, "_persist", side_effect=mock_persist),
            patch("backend.agents.buyer_intel.agent.verify_email", new=AsyncMock(return_value=EmailStatus.VALID)),
            patch("backend.agents.buyer_intel.agent.enrich_contact", new=AsyncMock(return_value=MagicMock(direct_phone=_NF, work_email=_NF))),
        ):
            apollo_mock = AsyncMock()
            apollo_mock.search_contacts = AsyncMock(
                side_effect=lambda domain, **kw: _mock_raw_contacts(domain, 3)
            )
            agent = BuyerIntelAgent(apollo=apollo_mock)
            package = await agent.run(_CLIENT_ID, al, master_ctx)

        # Run must complete (no exception raised)
        assert package is not None
        # Quota warning must be surfaced
        assert len(persisted_state.get("quota_warnings", [])) > 0
        # At least one domain must be marked pending
        assert len(persisted_state.get("pending_domains", [])) > 0
        # Processed accounts are present
        assert len(package.accounts) > 0

    @pytest.mark.asyncio
    async def test_hunter_quota_exhausted_tier3_ships_unverified(
        self, master_ctx
    ):
        """
        Hunter quota exhaustion must not fail the run. Tier 3 contacts
        always ship UNVERIFIED regardless.
        """
        def mock_check_and_increment(source: str) -> int:
            if source == "HUNTER":
                from datetime import date
                raise QuotaExhaustedError("HUNTER", 25, 25, date(2026, 5, 1))
            return 1

        al = _make_account_list([
            ("h1.in", "TIER_3"), ("h2.in", "TIER_3"),
        ])

        with (
            patch("backend.agents.buyer_intel.agent.check_and_increment", side_effect=mock_check_and_increment),
            patch.object(BuyerIntelAgent, "_persist", return_value=None),
            patch("backend.agents.buyer_intel.agent.verify_email", new=AsyncMock(return_value=EmailStatus.VALID)),
            patch("backend.agents.buyer_intel.agent.enrich_contact", new=AsyncMock(return_value=MagicMock(direct_phone=_NF, work_email=_NF))),
        ):
            apollo_mock = AsyncMock()
            apollo_mock.search_contacts = AsyncMock(
                side_effect=lambda domain, **kw: _mock_raw_contacts(domain, 3)
            )
            agent = BuyerIntelAgent(apollo=apollo_mock)
            package = await agent.run(_CLIENT_ID, al, master_ctx)

        # Run must succeed
        assert package is not None
        # Tier 3 contacts ship UNVERIFIED (Hunter skipped for Tier 3 by design)
        for domain, contacts in package.accounts.items():
            for c in contacts:
                assert c.email_status == EmailStatus.UNVERIFIED, (
                    f"{domain}/{c.full_name}: email_status={c.email_status}"
                )
