"""
Tests for Phase 3 Checkpoint 2 review state Pydantic models.

Run: pytest backend/tests/test_cp2_review_schemas.py -v
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from backend.schemas.models import (
    AccountApproval,
    AccountDecision,
    CP2AggregateProgress,
    CP2Blocker,
    CP2BlockerType,
    CP2ReviewState,
    CP2Status,
    ClaimSourceType,
    EvidenceStatus,
    InferredClaimReview,
    ReviewDecision,
)


SCHEMA_PATH = (
    Path(__file__).parent.parent / "schemas" / "cp2_review_state.schema.json"
)


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def pending_claim() -> dict:
    return {
        "claim_id": _uuid(),
        "source_type": "INTEL_REPORT_PRIORITY",
        "account_domain": "acme.in",
        "contact_id": None,
        "claim_text": "Acme is investing heavily in payments infrastructure",
        "evidence_status": "INFERRED",
        "reasoning": "Job postings for 5 senior payments engineers in Q1",
        "review_decision": "PENDING",
        "corrected_text": None,
        "review_notes": None,
        "reviewed_at": None,
    }


@pytest.fixture
def buyer_pain_claim() -> dict:
    return {
        "claim_id": _uuid(),
        "source_type": "BUYER_PAIN_POINT",
        "account_domain": "acme.in",
        "contact_id": _uuid(),
        "claim_text": "Manual reconciliation slows month-end close",
        "evidence_status": "INFERRED",
        "reasoning": "LinkedIn post complaining about close cycle",
        "review_decision": "PENDING",
        "corrected_text": None,
        "review_notes": None,
        "reviewed_at": None,
    }


@pytest.fixture
def pending_account() -> dict:
    return {
        "account_domain": "acme.in",
        "buyer_profiles_approved": False,
        "intel_report_approved": None,
        "account_decision": "PENDING",
        "account_notes": None,
    }


@pytest.fixture
def empty_state(pending_claim: dict, pending_account: dict) -> dict:
    return {
        "client_id": _uuid(),
        "status": "IN_REVIEW",
        "opened_at": _now_iso(),
        "approved_at": None,
        "reviewer": "ops@sennen.io",
        "reviewer_notes": None,
        "inferred_claims_review": [pending_claim],
        "account_approvals": [pending_account],
        "aggregate_progress": {
            "total_inferred_claims": 1,
            "reviewed_claims": 0,
            "approved_claims": 0,
            "corrected_claims": 0,
            "removed_claims": 0,
            "total_accounts": 1,
            "approved_accounts": 0,
            "removed_accounts": 0,
        },
        "blockers": [
            {"type": "UNREVIEWED_CLAIMS", "message": "1 claim pending review"},
            {"type": "UNAPPROVED_ACCOUNTS", "message": "1 account pending decision"},
        ],
    }


# ---------------------------------------------------------------------------
# JSON Schema (draft 2020-12) validation
# ---------------------------------------------------------------------------

def test_json_schema_is_valid_draft_2020_12() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)


def test_json_schema_accepts_in_review_state(empty_state: dict) -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator(schema).validate(empty_state)


def test_json_schema_rejects_unknown_status(empty_state: dict) -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    empty_state["status"] = "PARTIALLY_DONE"
    with pytest.raises(Exception):
        Draft202012Validator(schema).validate(empty_state)


# ---------------------------------------------------------------------------
# InferredClaimReview validators
# ---------------------------------------------------------------------------

def test_inferred_claim_review_pending_round_trip(pending_claim: dict) -> None:
    model = InferredClaimReview.model_validate(pending_claim)
    assert model.review_decision == ReviewDecision.PENDING
    assert model.evidence_status == EvidenceStatus.INFERRED


def test_inferred_claim_review_rejects_verified_evidence(pending_claim: dict) -> None:
    pending_claim["evidence_status"] = "VERIFIED"
    with pytest.raises(ValidationError, match="must be INFERRED"):
        InferredClaimReview.model_validate(pending_claim)


def test_corrected_decision_requires_corrected_text(pending_claim: dict) -> None:
    pending_claim["review_decision"] = "CORRECTED"
    pending_claim["reviewed_at"] = _now_iso()
    with pytest.raises(ValidationError, match="non-empty corrected_text"):
        InferredClaimReview.model_validate(pending_claim)


def test_corrected_text_only_allowed_when_decision_is_corrected(pending_claim: dict) -> None:
    pending_claim["review_decision"] = "APPROVED"
    pending_claim["reviewed_at"] = _now_iso()
    pending_claim["corrected_text"] = "rewritten"
    with pytest.raises(ValidationError, match="corrected_text must be null"):
        InferredClaimReview.model_validate(pending_claim)


def test_pending_decision_must_have_no_reviewed_at(pending_claim: dict) -> None:
    pending_claim["reviewed_at"] = _now_iso()
    with pytest.raises(ValidationError, match="reviewed_at must be null"):
        InferredClaimReview.model_validate(pending_claim)


def test_non_pending_decision_requires_reviewed_at(pending_claim: dict) -> None:
    pending_claim["review_decision"] = "APPROVED"
    pending_claim["reviewed_at"] = None
    with pytest.raises(ValidationError, match="reviewed_at is required"):
        InferredClaimReview.model_validate(pending_claim)


def test_buyer_pain_point_requires_contact_id(buyer_pain_claim: dict) -> None:
    buyer_pain_claim["contact_id"] = None
    with pytest.raises(ValidationError, match="BUYER_PAIN_POINT requires contact_id"):
        InferredClaimReview.model_validate(buyer_pain_claim)


def test_intel_report_claim_must_not_have_contact_id(pending_claim: dict) -> None:
    pending_claim["contact_id"] = _uuid()
    with pytest.raises(ValidationError, match="contact_id must be null"):
        InferredClaimReview.model_validate(pending_claim)


def test_corrected_decision_round_trip(pending_claim: dict) -> None:
    pending_claim["review_decision"] = "CORRECTED"
    pending_claim["corrected_text"] = "Sharper restatement"
    pending_claim["reviewed_at"] = _now_iso()
    model = InferredClaimReview.model_validate(pending_claim)
    assert model.review_decision == ReviewDecision.CORRECTED
    assert model.corrected_text == "Sharper restatement"


# ---------------------------------------------------------------------------
# CP2AggregateProgress
# ---------------------------------------------------------------------------

def test_aggregate_reviewed_count_must_equal_sum_of_decisions() -> None:
    with pytest.raises(ValidationError, match="approved \\+ corrected \\+ removed"):
        CP2AggregateProgress.model_validate({
            "total_inferred_claims": 10,
            "reviewed_claims": 5,
            "approved_claims": 2,
            "corrected_claims": 2,
            "removed_claims": 0,  # 2+2+0 = 4, but reviewed_claims says 5
            "total_accounts": 3,
            "approved_accounts": 1,
            "removed_accounts": 0,
        })


def test_aggregate_reviewed_cannot_exceed_total() -> None:
    with pytest.raises(ValidationError, match="cannot exceed total_inferred_claims"):
        CP2AggregateProgress.model_validate({
            "total_inferred_claims": 3,
            "reviewed_claims": 5,
            "approved_claims": 5,
            "corrected_claims": 0,
            "removed_claims": 0,
            "total_accounts": 1,
            "approved_accounts": 1,
            "removed_accounts": 0,
        })


# ---------------------------------------------------------------------------
# CP2ReviewState invariants
# ---------------------------------------------------------------------------

def test_cp2_in_review_state_round_trip(empty_state: dict) -> None:
    model = CP2ReviewState.model_validate(empty_state)
    assert model.status == CP2Status.IN_REVIEW
    assert len(model.inferred_claims_review) == 1


def test_cp2_approved_blocked_when_claims_pending(empty_state: dict) -> None:
    empty_state["status"] = "APPROVED"
    empty_state["approved_at"] = _now_iso()
    with pytest.raises(ValidationError, match="still PENDING"):
        CP2ReviewState.model_validate(empty_state)


def test_cp2_approved_blocked_when_accounts_pending(
    empty_state: dict, pending_claim: dict,
) -> None:
    pending_claim["review_decision"] = "APPROVED"
    pending_claim["reviewed_at"] = _now_iso()
    empty_state["inferred_claims_review"] = [pending_claim]
    empty_state["aggregate_progress"]["reviewed_claims"] = 1
    empty_state["aggregate_progress"]["approved_claims"] = 1
    empty_state["status"] = "APPROVED"
    empty_state["approved_at"] = _now_iso()
    with pytest.raises(ValidationError, match="every account decided"):
        CP2ReviewState.model_validate(empty_state)


def test_cp2_approved_succeeds_when_all_decided(
    empty_state: dict, pending_claim: dict, pending_account: dict,
) -> None:
    pending_claim["review_decision"] = "APPROVED"
    pending_claim["reviewed_at"] = _now_iso()
    pending_account["account_decision"] = "APPROVED"
    pending_account["buyer_profiles_approved"] = True
    empty_state["inferred_claims_review"] = [pending_claim]
    empty_state["account_approvals"] = [pending_account]
    empty_state["aggregate_progress"] = {
        "total_inferred_claims": 1,
        "reviewed_claims": 1,
        "approved_claims": 1,
        "corrected_claims": 0,
        "removed_claims": 0,
        "total_accounts": 1,
        "approved_accounts": 1,
        "removed_accounts": 0,
    }
    empty_state["status"] = "APPROVED"
    empty_state["approved_at"] = _now_iso()
    empty_state["blockers"] = []
    model = CP2ReviewState.model_validate(empty_state)
    assert model.status == CP2Status.APPROVED


def test_cp2_approved_requires_approved_at(
    empty_state: dict, pending_claim: dict, pending_account: dict,
) -> None:
    pending_claim["review_decision"] = "APPROVED"
    pending_claim["reviewed_at"] = _now_iso()
    pending_account["account_decision"] = "APPROVED"
    empty_state["inferred_claims_review"] = [pending_claim]
    empty_state["account_approvals"] = [pending_account]
    empty_state["aggregate_progress"] = {
        "total_inferred_claims": 1,
        "reviewed_claims": 1,
        "approved_claims": 1,
        "corrected_claims": 0,
        "removed_claims": 0,
        "total_accounts": 1,
        "approved_accounts": 1,
        "removed_accounts": 0,
    }
    empty_state["status"] = "APPROVED"
    empty_state["approved_at"] = None
    with pytest.raises(ValidationError, match="approved_at timestamp"):
        CP2ReviewState.model_validate(empty_state)


def test_cp2_approved_at_disallowed_unless_approved(empty_state: dict) -> None:
    empty_state["status"] = "IN_REVIEW"
    empty_state["approved_at"] = _now_iso()
    with pytest.raises(ValidationError, match="approved_at must be null"):
        CP2ReviewState.model_validate(empty_state)


def test_cp2_not_started_must_have_no_opened_at(empty_state: dict) -> None:
    empty_state["status"] = "NOT_STARTED"
    empty_state["opened_at"] = _now_iso()
    with pytest.raises(ValidationError, match="opened_at must be null"):
        CP2ReviewState.model_validate(empty_state)


def test_cp2_aggregate_total_must_match_claim_list(empty_state: dict) -> None:
    empty_state["aggregate_progress"]["total_inferred_claims"] = 99
    with pytest.raises(ValidationError, match="total_inferred_claims must equal"):
        CP2ReviewState.model_validate(empty_state)


def test_cp2_aggregate_total_must_match_account_list(empty_state: dict) -> None:
    empty_state["aggregate_progress"]["total_accounts"] = 99
    with pytest.raises(ValidationError, match="total_accounts must equal"):
        CP2ReviewState.model_validate(empty_state)


def test_blocker_type_enum_round_trip() -> None:
    blocker = CP2Blocker(
        type=CP2BlockerType.UNREVIEWED_CLAIMS,
        message="3 claims pending",
    )
    assert blocker.type == CP2BlockerType.UNREVIEWED_CLAIMS


def test_account_approval_intel_report_can_be_null() -> None:
    AccountApproval.model_validate({
        "account_domain": "tier3.com",
        "buyer_profiles_approved": True,
        "intel_report_approved": None,
        "account_decision": "APPROVED",
        "account_notes": None,
    })
