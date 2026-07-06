"""
Buyer Intel Agent — orchestrates buying-committee enrichment for Phase 2.

BuyerIntelAgent.run(client_id, account_list) -> BuyerIntelPackage

Pipeline per account (concurrent, cap 10):
  a) Build contact filters from master_context.buyers
  b) Apollo search_contacts(domain, filters) — up to 10 candidates
  c) Map each candidate to a committee role (committee_role_mapper)
  d) Pick up to 5: 1 DM + 2 Champions + 1 Blocker + 1 Influencer (contact_picker)
  e) Detect job_change_signal (tenure_current_role_months ≤ 6)
  f) Infer pain points (pain_inferer)
  g) Assemble BuyerProfile (source=APOLLO, recent_activity=[])

Apollo is the sole enrichment source — Hunter and Lusha are not used.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from backend.agents.buyer_intel.committee_role_mapper import map_committee_role
from backend.agents.buyer_intel.contact_picker import pick_committee
from backend.agents.buyer_intel.pain_inferer import infer_pain_points
from backend.agents.icp_scout.sources.apollo import ApolloRateLimitError, ApolloSource, RawContact
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
# Hunter and Lusha removed — Apollo is the sole enrichment source

logger = logging.getLogger(__name__)

_NF = "not_found"

# Apollo people search rate limit is ~1 req/sec on the $49 plan.
# Keep concurrency at 1 to avoid 429s; increase via env var if on a higher plan.
_ACCOUNT_CONCURRENCY = int(os.environ.get("BUYER_INTEL_ACCOUNT_CONCURRENCY", "1"))
_DB_CONCURRENCY = int(os.environ.get("BUYER_INTEL_DB_CONCURRENCY", "4"))
_APOLLO_REQUEST_DELAY = float(os.environ.get("APOLLO_REQUEST_DELAY_SECS", "1.2"))

# Apollo seniority strings → Seniority enum
_SENIORITY_MAP: dict[str, Seniority] = {
    "c_suite":               Seniority.C_SUITE,
    "owner":                 Seniority.C_SUITE,
    "founder":               Seniority.C_SUITE,
    "vp":                    Seniority.VP,
    "vice_president":        Seniority.VP,
    "director":              Seniority.DIRECTOR,
    "senior":                Seniority.DIRECTOR,
    "manager":               Seniority.MANAGER,
    "individual_contributor": Seniority.INDIVIDUAL_CONTRIBUTOR,
    "entry":                 Seniority.INDIVIDUAL_CONTRIBUTOR,
}

_JOB_CHANGE_THRESHOLD_MONTHS = int(os.environ.get("JOB_CHANGE_THRESHOLD_MONTHS", "6"))


def _map_email_status(apollo_status: str) -> EmailStatus:
    """Map Apollo people/match email_status → our EmailStatus enum."""
    s = (apollo_status or "").strip().lower()
    if s == "verified":
        return EmailStatus.VALID
    if s in ("unavailable", "bounced", ""):
        return EmailStatus.NOT_FOUND
    return EmailStatus.UNVERIFIED


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
        recent_activity=[],
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
    tier_order = {AccountTier.TIER_1: 0, AccountTier.TIER_2: 1, AccountTier.TIER_3: 2}
    return sorted(account_list.accounts, key=lambda a: tier_order.get(a.tier, 9))


class BuyerIntelAgent:
    """
    Orchestrates buying-committee enrichment for all accounts in an ICPAccountList.

    Processes all accounts concurrently (cap _ACCOUNT_CONCURRENCY) so a rate limit
    or quota exhaustion on one account does not block the rest.
    """

    def __init__(
        self,
        apollo: Optional[ApolloSource] = None,
    ) -> None:
        self._apollo = apollo or ApolloSource()
        if not os.environ.get("APOLLO_API_KEY"):
            logger.warning("BuyerIntelAgent: APOLLO_API_KEY not set — contact searches will be skipped")

    async def run(
        self,
        client_id: str,
        account_list: ICPAccountList,
        master_context: MasterContext,
        run_id: Optional[str] = None,
        zero_credit_mode: bool = False,
    ) -> BuyerIntelPackage:
        """
        zero_credit_mode=True — skips reveal flags (no credits used), skips Hunter/Lusha.
        Apollo still returns free work emails via the standard `email` field.
        """
        run_id = run_id or str(uuid.uuid4())
        accounts_sorted = _sort_accounts_by_tier(account_list)

        # Shared mutable state — all mutations guarded by _state_lock
        package_accounts: dict[str, list[BuyerProfile]] = {}
        quota_warnings: list[dict] = []
        pending_domains: list[str] = []
        _state_lock = asyncio.Lock()

        apollo_quota_used = 0
        hunter_quota_used = 0  # kept for schema compatibility, always 0
        total_contacts = 0
        mismatches_flagged = 0

        icp_titles: list[str] = master_context.buyers.titles
        icp_seniority: list[str] = master_context.buyers.seniority
        apollo_seniority = [s.lower().replace(" ", "_").replace("-", "_") for s in icp_seniority]

        account_semaphore = asyncio.Semaphore(_ACCOUNT_CONCURRENCY)
        db_semaphore = asyncio.Semaphore(_DB_CONCURRENCY)

        async def process_account(account) -> None:
            nonlocal apollo_quota_used, total_contacts, mismatches_flagged

            domain = account.domain
            tier = account.tier

            async with account_semaphore:
                # ── a) Apollo quota check ────────────────────────────────────
                try:
                    check_and_increment("APOLLO_CONTACTS")
                    async with _state_lock:
                        apollo_quota_used += 1
                except QuotaExhaustedError as exc:
                    warning = exc.to_dict()
                    warning["note"] = f"Apollo quota exhausted; domain={domain} skipped"
                    async with _state_lock:
                        quota_warnings.append(warning)
                        pending_domains.append(domain)
                    logger.warning("BuyerIntelAgent: Apollo quota exhausted at domain=%s", domain)
                    return

                # ── b) Apollo contact search ─────────────────────────────────
                # Throttle: Apollo people search allows ~1 req/sec on $49 plan.
                await asyncio.sleep(_APOLLO_REQUEST_DELAY)
                try:
                    raw_contacts: list[RawContact] = await self._apollo.search_contacts(
                        domain=domain,
                        titles=icp_titles,
                        seniority_levels=apollo_seniority,
                        max_results=10,
                        reveal=not zero_credit_mode,
                    )
                except ApolloRateLimitError:
                    warning = {
                        "source": "APOLLO_CONTACTS",
                        "note": f"Apollo rate limit (429) hit for domain={domain}; skipped.",
                    }
                    async with _state_lock:
                        quota_warnings.append(warning)
                        pending_domains.append(domain)
                    logger.warning("BuyerIntelAgent: Apollo rate limit at domain=%s — skipping", domain)
                    return

                if not raw_contacts:
                    logger.info("BuyerIntelAgent: no contacts found for domain=%s", domain)
                    async with _state_lock:
                        package_accounts[domain] = []
                    return

                # ── c–d) Role mapping + committee selection ──────────────────
                # The Apollo search endpoint returns only obfuscated stubs (no
                # email). We select the committee first, then reveal emails for
                # ONLY the selected contacts via people/match — this keeps credit
                # spend to ~5 reveals/account instead of enriching all candidates.
                profiled: list[BuyerProfile] = []
                apollo_id_by_profile: dict[str, str] = {}
                for raw in raw_contacts:
                    role, confidence, reasoning = map_committee_role(raw, master_context)
                    pain_points = infer_pain_points(raw, master_context)
                    profile = _apollo_to_buyer_profile(
                        raw=raw,
                        role=role,
                        confidence=confidence,
                        reasoning=reasoning,
                        email_status=EmailStatus.UNVERIFIED,
                        inferred_pps=pain_points,
                    )
                    profiled.append(profile)
                    apollo_id_by_profile[str(profile.contact_id)] = raw.contact_id

                selected = pick_committee(profiled)

                # ── e) Reveal emails for the selected committee ──────────────
                if not zero_credit_mode:
                    for i, profile in enumerate(selected):
                        apollo_id = apollo_id_by_profile.get(str(profile.contact_id))
                        if not apollo_id:
                            continue
                        await asyncio.sleep(_APOLLO_REQUEST_DELAY)
                        try:
                            enr = await self._apollo.enrich_person(apollo_id)
                        except ApolloRateLimitError:
                            async with _state_lock:
                                if domain not in pending_domains:
                                    pending_domains.append(domain)
                                quota_warnings.append({
                                    "source": "APOLLO_ENRICH",
                                    "note": f"Apollo rate limit (429) while revealing emails for domain={domain}; some contacts not enriched.",
                                })
                            logger.warning("BuyerIntelAgent: Apollo 429 during enrich at domain=%s — stopping enrichment for this account", domain)
                            break
                        email = enr["email"] if enr["email"] != _NF else None
                        # LinkedIn + profile fields come back on the same call as
                        # the email reveal (no extra credit cost). The search
                        # endpoint never returns linkedin_url, so this is the only
                        # place we can get it.
                        update: dict = {
                            "email": email,
                            "email_status": _map_email_status(enr["email_status"]),
                        }
                        if enr.get("linkedin_url") and enr["linkedin_url"] != _NF:
                            update["linkedin_url"] = enr["linkedin_url"]
                        selected[i] = profile.model_copy(update=update)

                # Mark NOT_FOUND for any contact still without an email
                for i, profile in enumerate(selected):
                    if not profile.email:
                        selected[i] = profile.model_copy(update={"email_status": EmailStatus.NOT_FOUND})

                # ── Aggregate metrics ────────────────────────────────────────
                account_mismatches = sum(1 for p in selected if p.title_mismatch_flag)
                async with _state_lock:
                    mismatches_flagged += account_mismatches
                    total_contacts += len(selected)
                    package_accounts[domain] = selected

                # ── Persist immediately ──────────────────────────────────────
                async with db_semaphore:
                    await asyncio.to_thread(
                        self._persist_one,
                        client_id=client_id,
                        domain=domain,
                        profiles=selected,
                    )

        await asyncio.gather(*[process_account(a) for a in accounts_sorted])

        self._persist_run(
            client_id=client_id,
            run_id=run_id,
            quota_warnings=quota_warnings,
            pending_domains=pending_domains,
            total_contacts=total_contacts,
            total_accounts=len(accounts_sorted),
            hunter_quota_used=hunter_quota_used,
        )

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
                "%d domain(s) pending: %s",
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

    def _persist_one(
        self,
        *,
        client_id: str,
        domain: str,
        profiles: list[BuyerProfile],
    ) -> None:
        db = SessionLocal()
        try:
            for profile in profiles:
                contact_id_str = str(profile.contact_id)
                profile_dict = profile.model_dump(mode="json")
                existing = db.query(BuyerProfileRecord).filter(
                    BuyerProfileRecord.contact_id == contact_id_str
                ).first()
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
            logger.exception("BuyerIntelAgent: failed to persist profiles for domain=%s", domain)
        finally:
            db.close()

    def _persist_run(
        self,
        *,
        client_id: str,
        run_id: str,
        quota_warnings: list[dict],
        pending_domains: list[str],
        total_contacts: int,
        total_accounts: int,
        hunter_quota_used: int,
    ) -> None:
        db = SessionLocal()
        try:
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
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("BuyerIntelAgent: failed to persist run_id=%s", run_id)
        finally:
            db.close()
