"""
Buyer Intel Agent — orchestrates buying-committee enrichment for Phase 2.

BuyerIntelAgent.run(client_id, account_list) -> BuyerIntelPackage

Pipeline per account (in tier-priority order: Tier 1 → Tier 2 → Tier 3):
  a) Build contact filters from master_context.buyers
  b) Apollo search_contacts(domain, filters) — up to 10 candidates
  c) Map each candidate to a committee role (committee_role_mapper)
  d) Pick up to 5: 1 DM + 2 Champions + 1 Blocker + 1 Influencer (contact_picker)
  e) Verify emails via Hunter (Tier 1 + Tier 2 only; Tier 3 → UNVERIFIED)
  f) Detect job_change_signal (tenure_current_role_months ≤ 6)
  g) Lusha enrichment for the DM on Tier 1 accounts only (quota-guarded)
  h) Infer pain points (pain_inferer)
  i) Assemble BuyerProfile (source=APOLLO, recent_activity=[])

Quota guards:
  - Apollo exhausted mid-run → remaining accounts marked PENDING_QUOTA_RESET
  - Hunter exhausted → Tier 3 already skipped; Tier 1/2 email_status → UNVERIFIED
  - Lusha exhausted → DM phone/email stays at Apollo values, no error raised
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from backend.agents.buyer_intel.committee_role_mapper import map_committee_role
from backend.agents.buyer_intel.contact_picker import pick_committee
from backend.agents.buyer_intel.pain_inferer import infer_pain_points
from backend.agents.buyer_intel.sources.hunter import verify_email
from backend.agents.buyer_intel.sources.lusha import enrich_contact
from backend.agents.icp_scout.sources.apollo import ApolloSource, RawContact
from backend.agents.icp_scout.sources.quota_manager import (
    QuotaExhaustedError,
    check_and_increment,
)
from backend.db.models import BuyerIntelRunRecord, BuyerProfileRecord
from backend.db.session import SessionLocal
from backend.schemas.models import (
    AccountTier,
    BuyerIntelMeta,
    BuyerIntelPackage,
    BuyerProfile,
    BuyerSource,
    CommitteeRole,
    EmailStatus,
    ICPAccountList,
    MasterContext,
    PastExperience,
    Seniority,
)

logger = logging.getLogger(__name__)

_NF = "not_found"

# Apollo seniority strings → Seniority enum
_SENIORITY_MAP: dict[str, Seniority] = {
    "c_suite":               Seniority.C_SUITE,
    "owner":                 Seniority.C_SUITE,
    "founder":               Seniority.C_SUITE,
    "vp":                    Seniority.VP,
    "vice_president":        Seniority.VP,
    "director":              Seniority.DIRECTOR,
    "senior":                Seniority.DIRECTOR,   # "senior" alone usually = senior director
    "manager":               Seniority.MANAGER,
    "individual_contributor": Seniority.INDIVIDUAL_CONTRIBUTOR,
    "entry":                 Seniority.INDIVIDUAL_CONTRIBUTOR,
}

_JOB_CHANGE_THRESHOLD_MONTHS = 6


def _map_seniority(label: str) -> Seniority:
    label_n = label.strip().lower()
    for key, val in _SENIORITY_MAP.items():
        if key in label_n:
            return val
    return Seniority.UNKNOWN


def _build_past_experience(raw_contact: RawContact) -> list[PastExperience]:
    out: list[PastExperience] = []
    for role in raw_contact.past_roles[:3]:
        out.append(PastExperience(
            company=role.company,
            title=role.title,
            start_date=role.start_date,
            end_date=role.end_date,
        ))
    return out


def _detect_job_change(tenure_months: int | str) -> bool:
    if isinstance(tenure_months, int):
        return tenure_months <= _JOB_CHANGE_THRESHOLD_MONTHS
    return False


def _apollo_to_buyer_profile(
    raw: RawContact,
    role: CommitteeRole,
    confidence: float,
    reasoning: str,
    email_status: EmailStatus,
    inferred_pps: list,
) -> BuyerProfile:
    """Assemble a BuyerProfile from a RawContact plus derived fields."""
    title_mismatch = raw.apollo_title != raw.current_title

    return BuyerProfile(
        contact_id=uuid.UUID(raw.contact_id) if _is_valid_uuid(raw.contact_id)
                   else uuid.uuid5(uuid.NAMESPACE_DNS, raw.contact_id),
        account_domain=raw.account_domain,
        full_name=raw.full_name,
        first_name=raw.first_name if raw.first_name != _NF else raw.full_name.split()[0],
        last_name=raw.last_name if raw.last_name != _NF else (raw.full_name.split()[-1] if raw.full_name else _NF),
        current_title=raw.current_title,
        apollo_title=raw.apollo_title,
        title_mismatch_flag=title_mismatch,
        seniority=_map_seniority(raw.seniority_label),
        department=raw.department if raw.department != _NF else "Unknown",
        email=raw.email if raw.email != _NF else None,
        email_status=email_status,
        phone=raw.phone if raw.phone != _NF else None,
        linkedin_url=raw.linkedin_url if raw.linkedin_url not in (_NF, "") else None,
        tenure_current_role_months=raw.tenure_current_role_months,
        tenure_current_company_months=raw.tenure_current_company_months,
        past_experience=_build_past_experience(raw),
        recent_activity=[],   # Phase 3 backfills via PhantomBuster
        job_change_signal=_detect_job_change(raw.tenure_current_role_months),
        committee_role=role,
        committee_role_confidence=confidence,
        committee_role_reasoning=reasoning,
        inferred_pain_points=inferred_pps,
        source=BuyerSource.APOLLO,
        enriched_at=datetime.now(tz=timezone.utc),
    )


def _is_valid_uuid(s: str) -> bool:
    try:
        uuid.UUID(s)
        return True
    except (ValueError, AttributeError):
        return False


def _sort_accounts_by_tier(account_list: ICPAccountList) -> list:
    """Return accounts sorted Tier 1 → Tier 2 → Tier 3 for quota-priority processing."""
    tier_order = {AccountTier.TIER_1: 0, AccountTier.TIER_2: 1, AccountTier.TIER_3: 2}
    return sorted(account_list.accounts, key=lambda a: tier_order.get(a.tier, 9))


class BuyerIntelAgent:
    """
    Orchestrates buying-committee enrichment for all accounts in an ICPAccountList.

    Designed to be run once per client after CP1 approval. Processes Tier 1 accounts
    first to prioritise the tightest Apollo/Hunter/Lusha quota usage where it matters most.
    """

    def __init__(
        self,
        apollo: Optional[ApolloSource] = None,
    ) -> None:
        self._apollo = apollo or ApolloSource()

    async def run(
        self,
        client_id: str,
        account_list: ICPAccountList,
        master_context: MasterContext,
        run_id: Optional[str] = None,
    ) -> BuyerIntelPackage:
        """
        Run committee enrichment for every account in account_list.

        Args:
            client_id:       Client UUID string.
            account_list:    Post-CP1 ICPAccountList (soft-deletes already filtered).
            master_context:  Client's MasterContext for ICP / buyer config.
            run_id:          If provided, updates an existing BuyerIntelRunRecord.

        Returns:
            BuyerIntelPackage with all enriched contacts.
        """
        run_id = run_id or str(uuid.uuid4())
        accounts_sorted = _sort_accounts_by_tier(account_list)

        package_accounts: dict[str, list[BuyerProfile]] = {}
        quota_warnings: list[dict] = []
        pending_domains: list[str] = []

        apollo_quota_used = 0
        hunter_quota_used = 0
        total_contacts = 0
        mismatches_flagged = 0

        icp_titles: list[str] = master_context.buyers.titles
        icp_seniority: list[str] = master_context.buyers.seniority

        # Map ICP seniority labels to Apollo's seniority strings
        apollo_seniority = [s.lower().replace(" ", "_") for s in icp_seniority]

        for account in accounts_sorted:
            domain = account.domain
            tier = account.tier

            # ------------------------------------------------------------------
            # a) Apollo contact search
            # ------------------------------------------------------------------
            try:
                check_and_increment("APOLLO_CONTACTS")
                apollo_quota_used += 1
            except QuotaExhaustedError as exc:
                warning = exc.to_dict()
                warning["note"] = f"Apollo quota exhausted; domain={domain} and all subsequent accounts marked PENDING_QUOTA_RESET"
                quota_warnings.append(warning)
                pending_domains.append(domain)
                # Mark all remaining accounts too
                remaining = [a.domain for a in accounts_sorted
                             if a.domain not in package_accounts and a.domain != domain]
                pending_domains.extend(remaining)
                logger.warning("BuyerIntelAgent: Apollo quota exhausted at domain=%s", domain)
                break

            raw_contacts: list[RawContact] = await self._apollo.search_contacts(
                domain=domain,
                titles=icp_titles,
                seniority_levels=apollo_seniority,
                max_results=10,
            )

            if not raw_contacts:
                logger.info("BuyerIntelAgent: no contacts found for domain=%s", domain)
                package_accounts[domain] = []
                continue

            # ------------------------------------------------------------------
            # b–c) Map committee roles to all candidates
            # ------------------------------------------------------------------
            profiled: list[BuyerProfile] = []
            for raw in raw_contacts:
                role, confidence, reasoning = map_committee_role(raw, master_context)
                pain_points = infer_pain_points(raw, master_context)

                profile = _apollo_to_buyer_profile(
                    raw=raw,
                    role=role,
                    confidence=confidence,
                    reasoning=reasoning,
                    email_status=EmailStatus.UNVERIFIED,   # set below
                    inferred_pps=pain_points,
                )
                profiled.append(profile)

            # ------------------------------------------------------------------
            # d) Pick up to 5 per slot quota
            # ------------------------------------------------------------------
            selected = pick_committee(profiled)

            # ------------------------------------------------------------------
            # e) Email verification via Hunter (Tier 1 + Tier 2 only)
            # ------------------------------------------------------------------
            for i, profile in enumerate(selected):
                if tier == AccountTier.TIER_3:
                    # Tier 3 ships UNVERIFIED — Hunter quota preserved for Tier 1/2
                    continue

                email = profile.email
                if not email:
                    # Use model_copy to update immutable field
                    selected[i] = profile.model_copy(update={"email_status": EmailStatus.NOT_FOUND})
                    continue

                try:
                    check_and_increment("HUNTER")
                    hunter_quota_used += 1
                except QuotaExhaustedError as exc:
                    warning = exc.to_dict()
                    warning["note"] = "Hunter quota exhausted; remaining contacts ship UNVERIFIED"
                    if not any(w.get("source") == "HUNTER" for w in quota_warnings):
                        quota_warnings.append(warning)
                    logger.warning("BuyerIntelAgent: Hunter quota exhausted")
                    break  # leave remaining contacts UNVERIFIED

                status = await verify_email(email)
                selected[i] = profile.model_copy(update={"email_status": status})

            # ------------------------------------------------------------------
            # g) Lusha enrichment — Tier 1 Decision-Maker only
            # ------------------------------------------------------------------
            if tier == AccountTier.TIER_1:
                for i, profile in enumerate(selected):
                    if profile.committee_role != CommitteeRole.DECISION_MAKER:
                        continue

                    try:
                        check_and_increment("LUSHA")
                    except QuotaExhaustedError as exc:
                        warning = exc.to_dict()
                        warning["note"] = "Lusha quota exhausted; DM enrichment skipped"
                        if not any(w.get("source") == "LUSHA" for w in quota_warnings):
                            quota_warnings.append(warning)
                        logger.warning("BuyerIntelAgent: Lusha quota exhausted")
                        break

                    enrichment = await enrich_contact(
                        first_name=profile.first_name,
                        last_name=profile.last_name,
                        company_domain=domain,
                    )

                    updates: dict = {}
                    if enrichment.direct_phone != _NF and profile.phone is None:
                        updates["phone"] = enrichment.direct_phone
                    if enrichment.work_email != _NF and profile.email is None:
                        updates["email"] = enrichment.work_email
                    if updates:
                        selected[i] = profile.model_copy(update=updates)
                    break  # only one DM per account

            # ------------------------------------------------------------------
            # Count title mismatches for meta
            # ------------------------------------------------------------------
            for profile in selected:
                if profile.title_mismatch_flag:
                    mismatches_flagged += 1

            total_contacts += len(selected)
            package_accounts[domain] = selected

        # ------------------------------------------------------------------
        # Persist to DB
        # ------------------------------------------------------------------
        self._persist(
            client_id=client_id,
            run_id=run_id,
            package_accounts=package_accounts,
            quota_warnings=quota_warnings,
            pending_domains=pending_domains,
            total_contacts=total_contacts,
            total_accounts=len(accounts_sorted),
            hunter_quota_used=hunter_quota_used,
        )

        # ------------------------------------------------------------------
        # Assemble BuyerIntelPackage
        # ------------------------------------------------------------------
        accounts_processed = len(package_accounts)
        avg = total_contacts / accounts_processed if accounts_processed else 0.0

        meta = BuyerIntelMeta(
            total_accounts_processed=accounts_processed,
            total_contacts_found=total_contacts,
            contacts_per_account_avg=round(avg, 2),
            hunter_quota_used=hunter_quota_used,
            apollo_quota_used=apollo_quota_used,
            mismatches_flagged=mismatches_flagged,
        )

        package = BuyerIntelPackage(
            client_id=uuid.UUID(client_id),
            generated_at=datetime.now(tz=timezone.utc),
            accounts=package_accounts,
            meta=meta,
        )

        if quota_warnings:
            logger.warning(
                "BuyerIntelAgent: run complete with %d quota warning(s). "
                "%d domain(s) pending quota reset: %s",
                len(quota_warnings),
                len(pending_domains),
                pending_domains[:5],
            )
        else:
            logger.info(
                "BuyerIntelAgent: run complete — %d accounts, %d contacts",
                accounts_processed,
                total_contacts,
            )

        return package

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    def _persist(
        self,
        *,
        client_id: str,
        run_id: str,
        package_accounts: dict[str, list[BuyerProfile]],
        quota_warnings: list[dict],
        pending_domains: list[str],
        total_contacts: int,
        total_accounts: int,
        hunter_quota_used: int,
    ) -> None:
        db = SessionLocal()
        try:
            # Upsert run record
            run_record = db.query(BuyerIntelRunRecord).filter(
                BuyerIntelRunRecord.id == run_id
            ).first()
            if run_record is None:
                run_record = BuyerIntelRunRecord(id=run_id, client_id=client_id)
                db.add(run_record)

            run_record.finished_at = datetime.now(tz=timezone.utc)
            run_record.total_accounts = total_accounts
            run_record.total_contacts = total_contacts
            run_record.quota_warnings = quota_warnings or None
            run_record.pending_domains = pending_domains or None
            run_record.status = (
                "complete_with_warnings" if (quota_warnings or pending_domains)
                else "complete"
            )

            # Upsert buyer profiles
            for domain, profiles in package_accounts.items():
                for profile in profiles:
                    contact_id_str = str(profile.contact_id)
                    existing = db.query(BuyerProfileRecord).filter(
                        BuyerProfileRecord.contact_id == contact_id_str
                    ).first()

                    profile_dict = profile.model_dump(mode="json")

                    if existing:
                        existing.data = profile_dict
                        existing.committee_role = profile.committee_role.value
                        existing.updated_at = datetime.now(tz=timezone.utc)
                    else:
                        db.add(BuyerProfileRecord(
                            client_id=client_id,
                            account_domain=domain,
                            contact_id=contact_id_str,
                            committee_role=profile.committee_role.value,
                            source=profile.source.value,
                            data=profile_dict,
                        ))

            db.commit()
        except Exception:
            db.rollback()
            logger.exception("BuyerIntelAgent: failed to persist run_id=%s", run_id)
        finally:
            db.close()
