from __future__ import annotations

from typing import Any

from backend.schemas.models import (
    BuyerProfile,
    CP2ReviewState,
    ClaimSourceType,
    MasterContext,
    ReviewDecision,
    SignalReport,
)


def _approved_texts(
    cp2_state: CP2ReviewState,
    *,
    account_domain: str,
    contact_id: str | None = None,
    source_type: ClaimSourceType | None = None,
) -> list[dict[str, str]]:
    texts: list[dict[str, str]] = []
    for claim in cp2_state.inferred_claims_review:
        if claim.account_domain != account_domain:
            continue
        if contact_id is not None and str(claim.contact_id) != contact_id:
            continue
        if source_type is not None and claim.source_type != source_type:
            continue
        if claim.review_decision == ReviewDecision.APPROVED:
            texts.append({"claim_id": str(claim.claim_id), "text": claim.claim_text})
        elif claim.review_decision == ReviewDecision.CORRECTED and claim.corrected_text:
            texts.append({"claim_id": str(claim.claim_id), "text": claim.corrected_text})
    return texts


def build_context(
    account: dict[str, Any],
    contact: BuyerProfile,
    intel_report: SignalReport | None,
    signals: SignalReport | None,
    master_context: MasterContext | None,
    cp2_state: CP2ReviewState,
) -> dict[str, Any]:
    account_domain = contact.account_domain
    contact_id = str(contact.contact_id)
    approved_pains = _approved_texts(
        cp2_state,
        account_domain=account_domain,
        contact_id=contact_id,
        source_type=ClaimSourceType.BUYER_PAIN_POINT,
    )
    intel_priorities = _approved_texts(
        cp2_state,
        account_domain=account_domain,
        source_type=ClaimSourceType.INTEL_REPORT_PRIORITY,
    )
    competitor_angles = _approved_texts(
        cp2_state,
        account_domain=account_domain,
        source_type=ClaimSourceType.INTEL_REPORT_COMPETITOR,
    )

    high_signals = []
    if signals is not None:
        high_signals = [
            signal.description
            for signal in signals.signals
            if signal.intent_level.value == "HIGH"
        ][:3]

    return {
        "master_context_value_prop": master_context.company.value_prop if master_context else "",
        "master_context_win_themes": master_context.gtm.win_themes if master_context else [],
        "account_company_name": account.get("company_name") or account.get("domain") or account_domain,
        "account_domain": account_domain,
        "account_intel_top_priority": intel_priorities[0]["text"] if intel_priorities else "",
        "account_intel_top_priority_claim_id": intel_priorities[0]["claim_id"] if intel_priorities else None,
        "account_intel_competitive_angle": competitor_angles[0]["text"] if competitor_angles else "",
        "account_intel_competitive_angle_claim_id": competitor_angles[0]["claim_id"] if competitor_angles else None,
        "contact_full_name": contact.full_name,
        "contact_title": contact.current_title,
        "contact_committee_role": contact.committee_role.value,
        "contact_job_change": contact.job_change_signal,
        "contact_approved_pain_points": [pain["text"] for pain in approved_pains],
        "contact_approved_pain_point_ids": [pain["claim_id"] for pain in approved_pains],
        "buying_stage": signals.buying_stage.value if signals else "",
        "recommended_angle": signals.recommended_outreach_approach if signals else "",
        "top_high_intent_signals": high_signals,
    }
