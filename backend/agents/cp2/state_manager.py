"""
Checkpoint 2 review state machine.

The state manager is the only authorised mutator for CP2ReviewState. It:

- Aggregates [INFERRED] claims from Phase 2 buyer profiles + intel reports
- Records every decision in an append-only audit log
- Re-computes blockers + aggregate progress on every mutation
- Refuses approval whenever invariants would be violated

Schema invariants are also enforced inside CP2ReviewState (Pydantic) and the
HTTP layer — three independent checks for the highest-stakes gate.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.db.models import (
    BuyerProfileRecord,
    CP2AuditLogRecord,
    CP2ReviewStateRecord,
    SignalReportRecord,
)
from backend.schemas.models import (
    AccountApproval,
    AccountDecision,
    BuyerProfile,
    CP2AggregateProgress,
    CP2ReviewState,
    CP2Status,
    ClaimSourceType,
    EvidenceStatus,
    InferredClaimReview,
    ReviewDecision,
    SignalReport,
)

from .invariants import compute_blockers


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class CP2StateError(Exception):
    """Raised when the requested mutation would violate a state invariant."""


class CP2NotFoundError(Exception):
    """Raised when no CP2 review exists for the given client."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _aggregate(
    claims: Iterable[InferredClaimReview],
    accounts: Iterable[AccountApproval],
) -> CP2AggregateProgress:
    claims = list(claims)
    accounts = list(accounts)
    approved = sum(1 for c in claims if c.review_decision == ReviewDecision.APPROVED)
    corrected = sum(1 for c in claims if c.review_decision == ReviewDecision.CORRECTED)
    removed = sum(1 for c in claims if c.review_decision == ReviewDecision.REMOVED)
    return CP2AggregateProgress(
        total_inferred_claims=len(claims),
        reviewed_claims=approved + corrected + removed,
        approved_claims=approved,
        corrected_claims=corrected,
        removed_claims=removed,
        total_accounts=len(accounts),
        approved_accounts=sum(
            1 for a in accounts if a.account_decision == AccountDecision.APPROVED
        ),
        removed_accounts=sum(
            1 for a in accounts
            if a.account_decision == AccountDecision.REMOVED_FROM_PIPELINE
        ),
    )


def _persist(
    db: Session,
    record: CP2ReviewStateRecord,
    state: CP2ReviewState,
) -> CP2ReviewState:
    """Refresh blockers + aggregate, validate, write to DB, return clean state."""

    # Recompute aggregate from the live claim/account lists so it can never drift.
    rebuilt = state.model_copy(update={
        "aggregate_progress": _aggregate(state.inferred_claims_review, state.account_approvals),
    })
    rebuilt = rebuilt.model_copy(update={"blockers": compute_blockers(rebuilt)})
    # Round-trip through model_validate to enforce all invariants once more.
    validated = CP2ReviewState.model_validate(rebuilt.model_dump(mode="json"))

    record.status = validated.status.value
    record.reviewer = validated.reviewer
    record.opened_at = validated.opened_at
    record.approved_at = validated.approved_at
    record.data = validated.model_dump(mode="json")
    db.add(record)
    db.commit()
    return validated


def _audit(
    db: Session,
    *,
    client_id: str,
    action: str,
    reviewer: str,
    claim_id: Optional[str] = None,
    account_domain: Optional[str] = None,
    before: Any = None,
    after: Any = None,
) -> None:
    db.add(
        CP2AuditLogRecord(
            id=str(uuid.uuid4()),
            client_id=client_id,
            claim_id=claim_id,
            account_domain=account_domain,
            action=action,
            reviewer=reviewer,
            before_state=before,
            after_state=after,
            timestamp=_now(),
        )
    )
    db.commit()


def _load_record(db: Session, client_id: str) -> CP2ReviewStateRecord:
    record = (
        db.query(CP2ReviewStateRecord)
        .filter(CP2ReviewStateRecord.client_id == client_id)
        .first()
    )
    if record is None:
        raise CP2NotFoundError(
            f"No CP2 review exists for client_id={client_id!r}; call open_review first"
        )
    return record


def _state_from_record(record: CP2ReviewStateRecord) -> CP2ReviewState:
    return CP2ReviewState.model_validate(record.data)


# ---------------------------------------------------------------------------
# Claim aggregation from Phase 2 outputs
# ---------------------------------------------------------------------------

def _collect_buyer_pain_claims(
    profiles: Iterable[BuyerProfile],
) -> List[InferredClaimReview]:
    claims: List[InferredClaimReview] = []
    for profile in profiles:
        for pain in profile.inferred_pain_points:
            claims.append(
                InferredClaimReview(
                    claim_id=uuid.uuid4(),
                    source_type=ClaimSourceType.BUYER_PAIN_POINT,
                    account_domain=profile.account_domain,
                    contact_id=profile.contact_id,
                    claim_text=pain.pain_point,
                    evidence_status=EvidenceStatus.INFERRED,
                    reasoning=(
                        f"Source: {pain.source}; confidence={pain.confidence:.2f}"
                    ),
                    review_decision=ReviewDecision.PENDING,
                    corrected_text=None,
                    review_notes=None,
                    reviewed_at=None,
                )
            )
    return claims


def _collect_intel_report_claims(
    reports: Iterable[SignalReport],
) -> List[InferredClaimReview]:
    claims: List[InferredClaimReview] = []
    for report in reports:
        intel = report.intel_report
        if intel is None:
            continue
        for priority in intel.strategic_priorities:
            if priority.evidence_status != EvidenceStatus.INFERRED:
                continue
            claims.append(
                InferredClaimReview(
                    claim_id=uuid.uuid4(),
                    source_type=ClaimSourceType.INTEL_REPORT_PRIORITY,
                    account_domain=report.account_domain,
                    contact_id=None,
                    claim_text=priority.priority,
                    evidence_status=EvidenceStatus.INFERRED,
                    reasoning=priority.evidence,
                    review_decision=ReviewDecision.PENDING,
                    corrected_text=None,
                    review_notes=None,
                    reviewed_at=None,
                )
            )
        for competitor in intel.competitive_landscape:
            if competitor.evidence_status != EvidenceStatus.INFERRED:
                continue
            claims.append(
                InferredClaimReview(
                    claim_id=uuid.uuid4(),
                    source_type=ClaimSourceType.INTEL_REPORT_COMPETITOR,
                    account_domain=report.account_domain,
                    contact_id=None,
                    claim_text=competitor.competitor_name,
                    evidence_status=EvidenceStatus.INFERRED,
                    reasoning=competitor.evidence,
                    review_decision=ReviewDecision.PENDING,
                    corrected_text=None,
                    review_notes=None,
                    reviewed_at=None,
                )
            )
        for pain in intel.inferred_pain_points:
            claims.append(
                InferredClaimReview(
                    claim_id=uuid.uuid4(),
                    source_type=ClaimSourceType.INTEL_REPORT_PAIN,
                    account_domain=report.account_domain,
                    contact_id=None,
                    claim_text=pain.pain_point,
                    evidence_status=EvidenceStatus.INFERRED,
                    reasoning=pain.reasoning,
                    review_decision=ReviewDecision.PENDING,
                    corrected_text=None,
                    review_notes=None,
                    reviewed_at=None,
                )
            )
    return claims


def _collect_account_domains(
    profiles: Iterable[BuyerProfile],
    reports: Iterable[SignalReport],
) -> List[Tuple[str, bool]]:
    """
    Returns [(account_domain, is_tier_1)] uniqued, ordered by domain for stability.
    is_tier_1 controls whether intel_report_approved starts as False or null.
    """

    tier_map: dict[str, bool] = {}
    for profile in profiles:
        tier_map.setdefault(profile.account_domain, False)
    for report in reports:
        # SignalReport.tier comes through as enum
        is_tier_1 = report.tier.value == "TIER_1"
        tier_map[report.account_domain] = (
            tier_map.get(report.account_domain, False) or is_tier_1
        )
    return sorted(tier_map.items())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def open_review(
    client_id: str,
    reviewer: str,
    db: Session,
) -> CP2ReviewState:
    """
    Open (or re-open) a CP2 review for `client_id`.

    Aggregates every [INFERRED] claim across persisted buyer profiles + signal
    reports for the client. If a CP2 row already exists with status
    NOT_STARTED it is filled in; any other status is rejected — re-opening an
    in-progress, approved or rejected review must be an explicit reset (not yet
    implemented; callers should fail loud if they hit it).
    """

    existing = (
        db.query(CP2ReviewStateRecord)
        .filter(CP2ReviewStateRecord.client_id == client_id)
        .first()
    )
    if existing is not None and existing.status != CP2Status.NOT_STARTED.value:
        # Idempotent fast-path for an already-open IN_REVIEW row.
        if existing.status == CP2Status.IN_REVIEW.value:
            return _state_from_record(existing)
        raise CP2StateError(
            f"CP2 review for client_id={client_id!r} is in status {existing.status!r}; "
            "cannot open a new review without explicit reset"
        )

    profiles = [
        BuyerProfile.model_validate(record.data)
        for record in (
            db.query(BuyerProfileRecord)
            .filter(BuyerProfileRecord.client_id == client_id)
            .all()
        )
    ]
    reports = [
        SignalReport.model_validate(record.data)
        for record in (
            db.query(SignalReportRecord)
            .filter(SignalReportRecord.client_id == client_id)
            .all()
        )
    ]

    claims = _collect_buyer_pain_claims(profiles) + _collect_intel_report_claims(reports)
    domains = _collect_account_domains(profiles, reports)
    accounts = [
        AccountApproval(
            account_domain=domain,
            buyer_profiles_approved=False,
            intel_report_approved=False if is_tier_1 else None,
            account_decision=AccountDecision.PENDING,
            account_notes=None,
        )
        for domain, is_tier_1 in domains
    ]

    state = CP2ReviewState(
        client_id=uuid.UUID(client_id),
        status=CP2Status.IN_REVIEW,
        opened_at=_now(),
        approved_at=None,
        reviewer=reviewer,
        reviewer_notes=None,
        inferred_claims_review=claims,
        account_approvals=accounts,
        aggregate_progress=_aggregate(claims, accounts),
        blockers=[],  # _persist recomputes
    )

    record = existing or CP2ReviewStateRecord(
        id=str(uuid.uuid4()),
        client_id=client_id,
    )
    persisted = _persist(db, record, state)
    _audit(
        db,
        client_id=client_id,
        action="OPEN_REVIEW",
        reviewer=reviewer,
        before=None,
        after={"total_claims": len(claims), "total_accounts": len(accounts)},
    )
    return persisted


def get_state(client_id: str, db: Session) -> CP2ReviewState:
    return _state_from_record(_load_record(db, client_id))


def review_claim(
    client_id: str,
    claim_id: str,
    decision: ReviewDecision,
    reviewer: str,
    db: Session,
    *,
    corrected_text: Optional[str] = None,
    review_notes: Optional[str] = None,
) -> CP2ReviewState:
    if decision == ReviewDecision.CORRECTED and not corrected_text:
        raise CP2StateError("decision=CORRECTED requires non-empty corrected_text")

    record = _load_record(db, client_id)
    state = _state_from_record(record)

    target_idx: Optional[int] = None
    for idx, claim in enumerate(state.inferred_claims_review):
        if str(claim.claim_id) == claim_id:
            target_idx = idx
            break
    if target_idx is None:
        raise CP2NotFoundError(f"claim_id={claim_id!r} not found in CP2 review")

    before = state.inferred_claims_review[target_idx].model_dump(mode="json")
    updated_claim = state.inferred_claims_review[target_idx].model_copy(update={
        "review_decision": decision,
        "corrected_text": corrected_text if decision == ReviewDecision.CORRECTED else None,
        "review_notes": review_notes,
        "reviewed_at": _now() if decision != ReviewDecision.PENDING else None,
    })
    new_claims = list(state.inferred_claims_review)
    new_claims[target_idx] = updated_claim

    new_state = state.model_copy(update={"inferred_claims_review": new_claims})
    persisted = _persist(db, record, new_state)
    _audit(
        db,
        client_id=client_id,
        action=f"REVIEW_CLAIM_{decision.value}",
        reviewer=reviewer,
        claim_id=claim_id,
        account_domain=updated_claim.account_domain,
        before=before,
        after=updated_claim.model_dump(mode="json"),
    )
    return persisted


def approve_account(
    client_id: str,
    account_domain: str,
    reviewer: str,
    db: Session,
    *,
    account_notes: Optional[str] = None,
) -> CP2ReviewState:
    record = _load_record(db, client_id)
    state = _state_from_record(record)

    pending_for_account = [
        c for c in state.inferred_claims_review
        if c.account_domain == account_domain
        and c.review_decision == ReviewDecision.PENDING
    ]
    if pending_for_account:
        raise CP2StateError(
            f"account {account_domain!r} has {len(pending_for_account)} "
            "claims still pending review — cannot approve"
        )

    target_idx: Optional[int] = None
    for idx, account in enumerate(state.account_approvals):
        if account.account_domain == account_domain:
            target_idx = idx
            break
    if target_idx is None:
        raise CP2NotFoundError(
            f"account_domain={account_domain!r} not found in CP2 review"
        )

    before = state.account_approvals[target_idx].model_dump(mode="json")
    existing = state.account_approvals[target_idx]
    updated_account = existing.model_copy(update={
        "account_decision": AccountDecision.APPROVED,
        "buyer_profiles_approved": True,
        "intel_report_approved": (
            True if existing.intel_report_approved is not None else None
        ),
        "account_notes": account_notes,
    })
    new_accounts = list(state.account_approvals)
    new_accounts[target_idx] = updated_account

    new_state = state.model_copy(update={"account_approvals": new_accounts})
    persisted = _persist(db, record, new_state)
    _audit(
        db,
        client_id=client_id,
        action="APPROVE_ACCOUNT",
        reviewer=reviewer,
        account_domain=account_domain,
        before=before,
        after=updated_account.model_dump(mode="json"),
    )
    return persisted


def remove_account(
    client_id: str,
    account_domain: str,
    reviewer: str,
    db: Session,
    *,
    reason: str,
) -> CP2ReviewState:
    record = _load_record(db, client_id)
    state = _state_from_record(record)

    target_idx: Optional[int] = None
    for idx, account in enumerate(state.account_approvals):
        if account.account_domain == account_domain:
            target_idx = idx
            break
    if target_idx is None:
        raise CP2NotFoundError(
            f"account_domain={account_domain!r} not found in CP2 review"
        )

    before = state.account_approvals[target_idx].model_dump(mode="json")
    updated_account = state.account_approvals[target_idx].model_copy(update={
        "account_decision": AccountDecision.REMOVED_FROM_PIPELINE,
        "buyer_profiles_approved": False,
        "account_notes": reason,
    })
    new_accounts = list(state.account_approvals)
    new_accounts[target_idx] = updated_account

    new_state = state.model_copy(update={"account_approvals": new_accounts})
    persisted = _persist(db, record, new_state)
    _audit(
        db,
        client_id=client_id,
        action="REMOVE_ACCOUNT",
        reviewer=reviewer,
        account_domain=account_domain,
        before=before,
        after=updated_account.model_dump(mode="json"),
    )
    return persisted


def approve_cp2(
    client_id: str,
    reviewer: str,
    db: Session,
    *,
    reviewer_notes: Optional[str] = None,
) -> CP2ReviewState:
    record = _load_record(db, client_id)
    state = _state_from_record(record)
    state = state.model_copy(update={"reviewer": reviewer})

    blockers = compute_blockers(state)
    if blockers:
        # Persist the latest blocker list so the UI can read it back.
        _persist(db, record, state)
        raise CP2StateError(
            "CP2 cannot be approved: " + "; ".join(b.message for b in blockers)
        )

    new_state = state.model_copy(update={
        "status": CP2Status.APPROVED,
        "approved_at": _now(),
        "reviewer_notes": reviewer_notes,
    })
    persisted = _persist(db, record, new_state)
    _audit(
        db,
        client_id=client_id,
        action="APPROVE_CP2",
        reviewer=reviewer,
        before={"status": state.status.value},
        after={"status": persisted.status.value},
    )
    return persisted


def reject_cp2(
    client_id: str,
    reviewer: str,
    db: Session,
    *,
    reason: str,
) -> CP2ReviewState:
    record = _load_record(db, client_id)
    state = _state_from_record(record)

    new_state = state.model_copy(update={
        "status": CP2Status.REJECTED,
        "reviewer": reviewer,
        "reviewer_notes": reason,
        "approved_at": None,
    })
    persisted = _persist(db, record, new_state)
    _audit(
        db,
        client_id=client_id,
        action="REJECT_CP2",
        reviewer=reviewer,
        before={"status": state.status.value},
        after={"status": persisted.status.value, "reason": reason},
    )
    return persisted


def get_audit_log(client_id: str, db: Session) -> list[dict]:
    rows = (
        db.query(CP2AuditLogRecord)
        .filter(CP2AuditLogRecord.client_id == client_id)
        .order_by(CP2AuditLogRecord.timestamp.asc())
        .all()
    )
    return [
        {
            "id": row.id,
            "claim_id": row.claim_id,
            "account_domain": row.account_domain,
            "action": row.action,
            "reviewer": row.reviewer,
            "before_state": row.before_state,
            "after_state": row.after_state,
            "timestamp": row.timestamp.isoformat() if row.timestamp else None,
        }
        for row in rows
    ]
