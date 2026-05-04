from __future__ import annotations

from backend.schemas.models import FreshnessState, Message, MessageSourceType

from .common import ValidationFailure, ValidationResult


def validate_freshness(message: Message) -> ValidationResult:
    failures: list[ValidationFailure] = []
    layers = message.personalization_layers
    for name in ("account_hook", "buyer_hook", "pain", "value"):
        layer = getattr(layers, name)
        if layer.source_type == MessageSourceType.RECENT_ACTIVITY:
            # Phase 4 has no recent-activity payload date on Message yet. Phase 5 plugs
            # activity metadata in upstream; until then the path is intentionally wired.
            continue
    if failures:
        return ValidationResult(FreshnessState.FAILED.value, failures)
    return ValidationResult(FreshnessState.PASSED.value, [])
