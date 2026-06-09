"""
Tests for Phase 3 verification Pydantic schema models.

Run: pytest backend/tests/test_phase3_verification_schemas.py -v
"""

import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from backend.schemas.models import (
    EmailFinalStatus,
    EngineName,
    ResolutionMethod,
    VerificationResult,
    VerifiedDataPackage,
)


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def valid_verification_result() -> dict:
    checked_at = _now()
    return {
        "contact_id": _uuid(),
        "account_domain": "acme.in",
        "email_verification": {
            "email": "priya@acme.in",
            "status": "VALID",
            "primary_engine": "NEVERBOUNCE",
            "secondary_engine": None,
            "primary_result": {
                "status": "VALID",
                "confidence": 0.98,
                "sub_status": "",
                "checked_at": checked_at,
            },
            "secondary_result": None,
            "relookup_attempted": False,
            "relookup_source": None,
            "relookup_email": None,
            "relookup_blocked_reason": None,
            "final_status": "VALID",
        },
        "linkedin_check": {
            "url": "https://linkedin.com/in/priyasharma",
            "reachable": True,
            "http_status": 200,
            "check_authoritative": True,
            "checked_at": checked_at,
        },
        "website_check": {
            "domain": "acme.in",
            "reachable": True,
            "http_status": 200,
            "checked_at": checked_at,
        },
        "title_reconciliation": {
            "apollo_title": "VP Sales",
            "linkedin_title": "VP of Sales",
            "resolved_title": "VP of Sales",
            "resolution_method": "LINKEDIN_PRIMARY",
            "mismatch_resolved": True,
        },
        "job_change_verification": {
            "apollo_claimed": False,
            "linkedin_confirmed": False,
            "verified": False,
            "confidence": 0.9,
        },
        "overall_data_quality_score": 94,
        "issues": [],
        "verified_at": checked_at,
    }


@pytest.fixture
def valid_verified_data_package(valid_verification_result: dict) -> dict:
    return {
        "client_id": _uuid(),
        "generated_at": _now(),
        "verifications": [valid_verification_result],
        "per_source_breakdown": {
            "apollo": {"total": 1, "valid": 1, "invalid": 0, "pass_rate": 1.0},
            "hunter": {"total": 0, "valid": 0, "invalid": 0, "pass_rate": 0.0},
            "clay": None,
            "linkedin_manual": None,
        },
        "aggregate": {
            "total_contacts": 1,
            "valid_emails": 1,
            "invalid_emails": 0,
            "catch_all": 0,
            "risky": 0,
            "not_found": 0,
            "deliverability_rate": 1.0,
            "linkedin_reachable_rate": 1.0,
            "linkedin_authoritative_rate": 1.0,
            "website_reachable_rate": 1.0,
            "title_mismatches_resolved": 1,
            "job_changes_verified": 0,
        },
        "quota_usage": {
            "neverbounce_used_this_run": 1,
            "zerobounce_used_this_run": 0,
            "hunter_used_this_run": 0,
            "neverbounce_remaining": 999,
            "zerobounce_remaining": 1000,
            "hunter_remaining": 500,
        },
        "meets_deliverability_target": True,
        "target_miss_diagnosis": None,
    }


def test_valid_verification_result_with_valid_email_passes(
    valid_verification_result: dict,
) -> None:
    result = VerificationResult.model_validate(valid_verification_result)
    assert result.email_verification.final_status == EmailFinalStatus.VALID
    assert result.email_verification.primary_engine == EngineName.NEVERBOUNCE
    assert result.title_reconciliation.resolution_method == ResolutionMethod.LINKEDIN_PRIMARY


def test_secondary_engine_zerobounce_requires_secondary_result(
    valid_verification_result: dict,
) -> None:
    valid_verification_result["email_verification"]["secondary_engine"] = "ZEROBOUNCE"
    valid_verification_result["email_verification"]["secondary_result"] = None

    with pytest.raises(ValidationError):
        VerificationResult.model_validate(valid_verification_result)


def test_verified_data_package_missed_target_requires_diagnosis(
    valid_verified_data_package: dict,
) -> None:
    valid_verified_data_package["aggregate"]["deliverability_rate"] = 0.8
    valid_verified_data_package["meets_deliverability_target"] = False
    valid_verified_data_package["target_miss_diagnosis"] = None

    with pytest.raises(ValidationError):
        VerifiedDataPackage.model_validate(valid_verified_data_package)


def test_linkedin_primary_title_reconciliation_requires_linkedin_title(
    valid_verification_result: dict,
) -> None:
    valid_verification_result["title_reconciliation"]["resolution_method"] = "LINKEDIN_PRIMARY"
    valid_verification_result["title_reconciliation"]["linkedin_title"] = None

    with pytest.raises(ValidationError):
        VerificationResult.model_validate(valid_verification_result)


def test_linkedin_http_999_requires_non_authoritative_check(
    valid_verification_result: dict,
) -> None:
    valid_verification_result["linkedin_check"]["http_status"] = 999
    valid_verification_result["linkedin_check"]["check_authoritative"] = True

    with pytest.raises(ValidationError):
        VerificationResult.model_validate(valid_verification_result)


def test_relookup_attempted_requires_email_or_blocked_reason(
    valid_verification_result: dict,
) -> None:
    valid_verification_result["email_verification"]["relookup_attempted"] = True
    valid_verification_result["email_verification"]["relookup_source"] = "HUNTER"
    valid_verification_result["email_verification"]["relookup_email"] = None
    valid_verification_result["email_verification"]["relookup_blocked_reason"] = None

    with pytest.raises(ValidationError):
        VerificationResult.model_validate(valid_verification_result)
