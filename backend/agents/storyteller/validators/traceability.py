from __future__ import annotations

from typing import Iterable

from backend.schemas.models import (
    AccountTier,
    CP2ReviewState,
    EvidenceStatus,
    Message,
    MessageChannel,
    MessageSourceType,
    ReviewDecision,
    TraceabilityState,
)

from .common import ValidationFailure, ValidationResult


ALLOWED_SOURCE_TYPES = {
    "account_hook": {
        MessageSourceType.INTEL_REPORT_PRIORITY,
        MessageSourceType.INTEL_REPORT_COMPETITOR,
        MessageSourceType.SIGNAL_TIMELINE,
        MessageSourceType.RECENT_ACTIVITY,
    },
    "buyer_hook": {
        MessageSourceType.JOB_CHANGE_SIGNAL,
        MessageSourceType.RECENT_ACTIVITY,
        MessageSourceType.BUYER_PAIN_POINT,
    },
    "pain": {
        MessageSourceType.BUYER_PAIN_POINT,
        MessageSourceType.INTEL_REPORT_PAIN,
    },
    "value": {
        MessageSourceType.MASTER_CONTEXT_VALUE_PROP,
        MessageSourceType.MASTER_CONTEXT_WIN_THEME,
    },
}

REQUIRED_LAYERS = {
    MessageChannel.EMAIL: {"account_hook", "buyer_hook", "pain", "value"},
    MessageChannel.LINKEDIN_DM: {"account_hook", "buyer_hook", "pain"},
}


def _approved_claim_ids(cp2_state: CP2ReviewState | None) -> set[str]:
    if cp2_state is None:
        return set()
    ids: set[str] = set()
    for claim in cp2_state.inferred_claims_review:
        if claim.review_decision in {ReviewDecision.APPROVED, ReviewDecision.CORRECTED}:
            ids.add(str(claim.claim_id))
        elif claim.evidence_status == EvidenceStatus.VERIFIED:
            ids.add(str(claim.claim_id))
    return ids


def _iter_layers(message: Message) -> Iterable[tuple[str, object]]:
    layers = message.personalization_layers
    for name in ("account_hook", "buyer_hook", "pain", "value"):
        yield name, getattr(layers, name)


def validate_traceability(
    message: Message,
    tier: AccountTier,
    cp2_state: CP2ReviewState | None,
) -> ValidationResult:
    approved = _approved_claim_ids(cp2_state)
    failures: list[ValidationFailure] = []
    required = REQUIRED_LAYERS.get(message.channel, set())
    if tier == AccountTier.TIER_1:
        required = {"account_hook", "buyer_hook", "pain", "value"}

    for name, layer in _iter_layers(message):
        source_type = layer.source_type
        if source_type not in ALLOWED_SOURCE_TYPES[name]:
            failures.append(ValidationFailure(name, f"{source_type.value} is not allowed for {name}"))

        empty_or_untraced = layer.untraced or layer.source_claim_id is None or not layer.text.strip()
        if name in required and not layer.text.strip():
            failures.append(ValidationFailure(name, "required layer is empty"))
            continue

        if source_type in {
            MessageSourceType.MASTER_CONTEXT_VALUE_PROP,
            MessageSourceType.MASTER_CONTEXT_WIN_THEME,
            MessageSourceType.JOB_CHANGE_SIGNAL,
            MessageSourceType.SIGNAL_TIMELINE,
        }:
            if layer.untraced or not layer.text.strip():
                failures.append(ValidationFailure(name, "layer is untraced or empty"))
            continue

        if empty_or_untraced:
            failures.append(ValidationFailure(name, "layer is untraced, empty, or missing source_claim_id"))
        elif str(layer.source_claim_id) not in approved and cp2_state is not None:
            failures.append(ValidationFailure(name, "source_claim_id is not CP2-approved"))

    if not failures:
        return ValidationResult(TraceabilityState.PASSED, [])
    if tier == AccountTier.TIER_1 or any("required layer" in f.reason for f in failures):
        return ValidationResult(TraceabilityState.HARD_FAIL, failures)
    return ValidationResult(TraceabilityState.SOFT_FAIL, failures)

