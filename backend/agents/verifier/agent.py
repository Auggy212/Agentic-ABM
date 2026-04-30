"""
Verifier Agent for Phase 3.

Consumes Phase 2 BuyerIntelPackage rows and closes the verification loop:
email deliverability, LinkedIn/website reachability, title reconciliation,
job-change confidence, source-level diagnosis, and run persistence.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import uuid
from datetime import datetime, timezone
from typing import Callable, Optional

from backend.agents.verifier.diagnosis import diagnose_target_miss
from backend.agents.verifier.email_verifier import (
    EmailVerifier,
    neverbounce_remaining,
    zerobounce_remaining,
)
from backend.agents.verifier.job_change_verifier import (
    APOLLO_ONLY_JOB_CHANGE_WARNING,
    verify_job_change,
)
from backend.agents.verifier.quality_scorer import compute_overall_data_quality_score
from backend.agents.verifier.relookup import hunter_remaining_quota
from backend.agents.verifier.title_reconciler import (
    TITLE_PENDING_WARNING,
    reconcile_title,
)
from backend.agents.verifier.url_checker import UrlCheckResult, check_url
from backend.schemas.models import (
    BuyerIntelPackage,
    BuyerProfile,
    BuyerSource,
    EmailFinalStatus,
    EmailVerification,
    LinkedinCheck,
    PerSourceBreakdown,
    QuotaUsage,
    SourceBreakdown,
    VerificationAggregate,
    VerificationIssue,
    VerificationIssueSeverity,
    VerificationResult,
    VerifiedDataPackage,
    WebsiteCheck,
)

logger = logging.getLogger(__name__)

MAX_CONCURRENT_VERIFICATIONS = 10


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _domain_to_url(domain: str) -> str:
    if domain.startswith("http://") or domain.startswith("https://"):
        return domain
    return f"https://{domain}"


def _source_key(contact: BuyerProfile) -> str:
    if contact.source == BuyerSource.CLAY:
        return "clay"
    if contact.source == BuyerSource.LINKEDIN_MANUAL:
        return "linkedin_manual"
    return "apollo"


class VerifierAgent:
    def __init__(
        self,
        *,
        email_verifier: Optional[EmailVerifier] = None,
        url_checker: Callable[[str], UrlCheckResult] = check_url,
        persist_results: bool = True,
    ) -> None:
        self.email_verifier = email_verifier or EmailVerifier()
        self.url_checker = url_checker
        self.persist_results = persist_results

    async def run(
        self,
        client_id: str,
        buyer_intel_package: BuyerIntelPackage,
        run_id: Optional[str] = None,
    ) -> VerifiedDataPackage:
        run_id = run_id or str(uuid.uuid4())
        contacts = [
            contact
            for contacts_for_domain in buyer_intel_package.accounts.values()
            for contact in contacts_for_domain
        ]

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_VERIFICATIONS)

        async def bounded(index: int, contact: BuyerProfile) -> VerificationResult:
            async with semaphore:
                await asyncio.sleep((index % MAX_CONCURRENT_VERIFICATIONS) * 0.03)
                return await self._verify_contact(contact)

        verifications = await asyncio.gather(
            *(bounded(i, contact) for i, contact in enumerate(contacts))
        )

        per_source_breakdown = self._compute_per_source_breakdown(contacts, verifications)
        aggregate = self._compute_aggregate(verifications)
        meets_target = aggregate.deliverability_rate >= 0.9
        diagnosis = None if meets_target else diagnose_target_miss(per_source_breakdown)

        quota_usage = self._quota_usage(verifications)

        package = VerifiedDataPackage(
            client_id=uuid.UUID(client_id),
            generated_at=_now(),
            verifications=verifications,
            per_source_breakdown=per_source_breakdown,
            aggregate=aggregate,
            quota_usage=quota_usage,
            meets_deliverability_target=meets_target,
            target_miss_diagnosis=diagnosis,
        )

        if self.persist_results:
            self._persist(client_id=client_id, run_id=run_id, package=package)

        return package

    async def _verify_contact(self, contact: BuyerProfile) -> VerificationResult:
        issues: list[VerificationIssue] = []

        email_verification = await self._verify_email(contact)
        for warning in self._drain_email_warnings():
            issues.append(self._issue("WARNING", "EMAIL_QUOTA_FALLBACK", warning))
        self._append_email_issues(email_verification, issues)

        linkedin_check = await self._check_linkedin(contact)
        if linkedin_check.http_status == 999:
            issues.append(
                self._issue(
                    "INFO",
                    "LINKEDIN_999_NON_AUTHORITATIVE",
                    "LinkedIn returned HTTP 999; reachable=true but check_authoritative=false.",
                )
            )

        website_check = await self._check_website(contact.account_domain)

        title_reconciliation = reconcile_title(
            apollo_title=contact.apollo_title,
            linkedin_url=str(contact.linkedin_url) if contact.linkedin_url else None,
        )
        if not title_reconciliation.mismatch_resolved:
            issues.append(self._issue("WARNING", "TITLE_RECONCILIATION_PENDING", TITLE_PENDING_WARNING))

        job_change_verification = verify_job_change(contact, recent_activity=None)
        if job_change_verification.linkedin_confirmed is None:
            issues.append(
                self._issue(
                    "WARNING",
                    "JOB_CHANGE_APOLLO_ONLY",
                    APOLLO_ONLY_JOB_CHANGE_WARNING,
                )
            )

        score = compute_overall_data_quality_score(
            email_status=email_verification.final_status,
            linkedin_reachable=(
                None if contact.linkedin_url is None else linkedin_check.reachable
            ),
            website_reachable=website_check.reachable,
            title_reconciliation=title_reconciliation,
            job_change_verification=job_change_verification,
            issues=issues,
        )

        return VerificationResult(
            contact_id=contact.contact_id,
            account_domain=contact.account_domain,
            email_verification=email_verification,
            linkedin_check=linkedin_check,
            website_check=website_check,
            title_reconciliation=title_reconciliation,
            job_change_verification=job_change_verification,
            overall_data_quality_score=score,
            issues=issues,
            verified_at=_now(),
        )

    async def _verify_email(self, contact: BuyerProfile) -> EmailVerification:
        verifier = self.email_verifier
        email = contact.email or ""

        if hasattr(verifier, "verify_email"):
            return await verifier.verify_email(
                email,
                domain=contact.account_domain,
                full_name=contact.full_name,
            )

        result = verifier(email)
        if inspect.isawaitable(result):
            return await result
        return result

    def _drain_email_warnings(self) -> list[str]:
        drain = getattr(self.email_verifier, "drain_warnings", None)
        if callable(drain):
            return drain()
        return []

    async def _check_linkedin(self, contact: BuyerProfile) -> LinkedinCheck:
        if not contact.linkedin_url:
            return LinkedinCheck(
                url=None,
                reachable=False,
                http_status=None,
                check_authoritative=True,
                checked_at=_now(),
            )

        result = await asyncio.to_thread(self.url_checker, str(contact.linkedin_url))
        return LinkedinCheck(
            url=str(contact.linkedin_url),
            reachable=result.reachable,
            http_status=result.http_status,
            check_authoritative=False if result.http_status == 999 else True,
            checked_at=result.checked_at,
        )

    async def _check_website(self, domain: str) -> WebsiteCheck:
        result = await asyncio.to_thread(self.url_checker, _domain_to_url(domain))
        return WebsiteCheck(
            domain=domain,
            reachable=result.reachable,
            http_status=result.http_status,
            checked_at=result.checked_at,
        )

    def _append_email_issues(
        self,
        email_verification: EmailVerification,
        issues: list[VerificationIssue],
    ) -> None:
        status = email_verification.final_status
        if status in {EmailFinalStatus.INVALID, EmailFinalStatus.NOT_FOUND}:
            issues.append(
                self._issue(
                    "ERROR",
                    f"EMAIL_{status.value}",
                    f"Email verification final_status={status.value}.",
                )
            )
        elif status in {EmailFinalStatus.CATCH_ALL, EmailFinalStatus.RISKY}:
            issues.append(
                self._issue(
                    "WARNING",
                    f"EMAIL_{status.value}",
                    f"Email verification final_status={status.value}; do not treat as VALID.",
                )
            )

        if email_verification.relookup_blocked_reason is not None:
            issues.append(
                self._issue(
                    "WARNING",
                    "HUNTER_RELOOKUP_BLOCKED",
                    f"Hunter relookup blocked: {email_verification.relookup_blocked_reason.value}.",
                )
            )

    def _issue(self, severity: str, code: str, message: str) -> VerificationIssue:
        return VerificationIssue(
            severity=VerificationIssueSeverity(severity),
            code=code,
            message=message,
        )

    def _compute_per_source_breakdown(
        self,
        contacts: list[BuyerProfile],
        verifications: list[VerificationResult],
    ) -> PerSourceBreakdown:
        by_id = {str(v.contact_id): v for v in verifications}
        totals: dict[str, dict[str, int]] = {
            "apollo": {"total": 0, "valid": 0},
            "clay": {"total": 0, "valid": 0},
            "linkedin_manual": {"total": 0, "valid": 0},
            "hunter": {"total": 0, "valid": 0},
        }

        for contact in contacts:
            verification = by_id[str(contact.contact_id)]
            key = _source_key(contact)
            totals[key]["total"] += 1
            if verification.email_verification.final_status == EmailFinalStatus.VALID:
                totals[key]["valid"] += 1

            if verification.email_verification.relookup_attempted:
                totals["hunter"]["total"] += 1
                if (
                    verification.email_verification.relookup_email
                    and verification.email_verification.final_status == EmailFinalStatus.VALID
                ):
                    totals["hunter"]["valid"] += 1

        return PerSourceBreakdown(
            apollo=self._breakdown(totals["apollo"]),
            hunter=self._breakdown(totals["hunter"]),
            clay=self._breakdown(totals["clay"]) if totals["clay"]["total"] else None,
            linkedin_manual=(
                self._breakdown(totals["linkedin_manual"])
                if totals["linkedin_manual"]["total"]
                else None
            ),
        )

    def _breakdown(self, raw: dict[str, int]) -> SourceBreakdown:
        total = raw["total"]
        valid = raw["valid"]
        invalid = total - valid
        return SourceBreakdown(
            total=total,
            valid=valid,
            invalid=invalid,
            pass_rate=round(valid / total, 4) if total else 0.0,
        )

    def _compute_aggregate(self, verifications: list[VerificationResult]) -> VerificationAggregate:
        total = len(verifications)
        status_counts = {status: 0 for status in EmailFinalStatus}
        for verification in verifications:
            status_counts[verification.email_verification.final_status] += 1

        linkedin_with_status = [
            v for v in verifications if v.linkedin_check.http_status is not None
        ]
        linkedin_authoritative = [
            v for v in linkedin_with_status if v.linkedin_check.http_status != 999
        ]

        return VerificationAggregate(
            total_contacts=total,
            valid_emails=status_counts[EmailFinalStatus.VALID],
            invalid_emails=status_counts[EmailFinalStatus.INVALID],
            catch_all=status_counts[EmailFinalStatus.CATCH_ALL],
            risky=status_counts[EmailFinalStatus.RISKY],
            not_found=status_counts[EmailFinalStatus.NOT_FOUND],
            deliverability_rate=round(status_counts[EmailFinalStatus.VALID] / total, 4)
            if total
            else 0.0,
            linkedin_reachable_rate=round(
                sum(1 for v in verifications if v.linkedin_check.reachable) / total, 4
            )
            if total
            else 0.0,
            linkedin_authoritative_rate=round(
                len(linkedin_authoritative) / len(linkedin_with_status), 4
            )
            if linkedin_with_status
            else 0.0,
            website_reachable_rate=round(
                sum(1 for v in verifications if v.website_check.reachable) / total, 4
            )
            if total
            else 0.0,
            title_mismatches_resolved=sum(
                1 for v in verifications if v.title_reconciliation.mismatch_resolved
            ),
            job_changes_verified=sum(
                1 for v in verifications if v.job_change_verification.verified
            ),
        )

    def _quota_usage(self, verifications: list[VerificationResult]) -> QuotaUsage:
        neverbounce_used = getattr(self.email_verifier, "neverbounce_used_this_run", None)
        zerobounce_used = getattr(self.email_verifier, "zerobounce_used_this_run", None)
        relookup_service = getattr(self.email_verifier, "relookup_service", None)
        hunter_used = getattr(relookup_service, "used_this_run", None)

        if neverbounce_used is None:
            neverbounce_used = sum(
                1
                for v in verifications
                if v.email_verification.primary_engine.value == "NEVERBOUNCE"
            )
        if zerobounce_used is None:
            zerobounce_used = sum(
                1
                for v in verifications
                if v.email_verification.primary_engine.value == "ZEROBOUNCE"
                or v.email_verification.secondary_engine is not None
            )
        if hunter_used is None:
            hunter_used = sum(
                1 for v in verifications if v.email_verification.relookup_attempted
            )

        return QuotaUsage(
            neverbounce_used_this_run=neverbounce_used,
            zerobounce_used_this_run=zerobounce_used,
            hunter_used_this_run=hunter_used,
            neverbounce_remaining=neverbounce_remaining(),
            zerobounce_remaining=zerobounce_remaining(),
            hunter_remaining=hunter_remaining_quota(),
        )

    def _persist(self, *, client_id: str, run_id: str, package: VerifiedDataPackage) -> None:
        from backend.db.models import VerificationResultRecord, VerifiedRunRecord
        from backend.db.session import SessionLocal

        db = SessionLocal()
        try:
            run_record = (
                db.query(VerifiedRunRecord)
                .filter(VerifiedRunRecord.id == run_id)
                .first()
            )
            if run_record is None:
                run_record = VerifiedRunRecord(
                    id=run_id,
                    client_id=client_id,
                    started_at=package.generated_at,
                    status="running",
                )
                db.add(run_record)

            for result in package.verifications:
                existing = (
                    db.query(VerificationResultRecord)
                    .filter(
                        VerificationResultRecord.client_id == client_id,
                        VerificationResultRecord.contact_id == str(result.contact_id),
                    )
                    .first()
                )
                data = result.model_dump(mode="json")
                if existing:
                    existing.account_domain = result.account_domain
                    existing.data = data
                    existing.final_email_status = result.email_verification.final_status.value
                    existing.overall_data_quality_score = result.overall_data_quality_score
                    existing.verified_at = result.verified_at
                else:
                    db.add(
                        VerificationResultRecord(
                            client_id=client_id,
                            contact_id=str(result.contact_id),
                            account_domain=result.account_domain,
                            data=data,
                            final_email_status=result.email_verification.final_status.value,
                            overall_data_quality_score=result.overall_data_quality_score,
                            verified_at=result.verified_at,
                        )
                    )

            run_record.finished_at = _now()
            run_record.deliverability_rate = package.aggregate.deliverability_rate
            run_record.meets_target = package.meets_deliverability_target
            run_record.diagnosis = package.target_miss_diagnosis
            run_record.quota_usage = package.quota_usage.model_dump(mode="json")
            run_record.data = package.model_dump(mode="json")
            run_record.status = "complete"
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("VerifierAgent: failed to persist run_id=%s", run_id)
        finally:
            db.close()
