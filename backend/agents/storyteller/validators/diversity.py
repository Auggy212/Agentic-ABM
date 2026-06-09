from __future__ import annotations

import hashlib
import re
from uuid import UUID

from backend.schemas.models import DiversityState, Message

from .common import ValidationFailure, ValidationResult

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "for", "from", "in", "is", "of", "on",
    "or", "the", "to", "with", "your", "you", "team", "company",
}


def _tokens(text: str, *remove: str) -> set[str]:
    normalized = text.lower()
    for item in remove:
        normalized = normalized.replace(item.lower(), " ")
    words = re.findall(r"[a-z0-9]+", normalized)
    return {word for word in words if word not in STOPWORDS and len(word) > 2}


def diversity_signature(message: Message) -> str:
    layers = message.personalization_layers
    tokens = sorted(
        _tokens(
            f"{layers.account_hook.text} {layers.buyer_hook.text}",
            message.account_domain,
        )
    )
    digest = hashlib.sha256(" ".join(tokens).encode("utf-8")).hexdigest()[:16]
    return f"hash:{digest}"


def _similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / max(len(a), len(b))


def validate_diversity(message: Message, all_messages_so_far: list[Message]) -> ValidationResult:
    layers = message.personalization_layers
    base_tokens = _tokens(f"{layers.account_hook.text} {layers.buyer_hook.text}", message.account_domain)
    collisions: list[UUID] = []
    for other in all_messages_so_far:
        if other.channel != message.channel or other.sequence_position != message.sequence_position:
            continue
        other_layers = other.personalization_layers
        other_tokens = _tokens(f"{other_layers.account_hook.text} {other_layers.buyer_hook.text}", other.account_domain)
        if _similarity(base_tokens, other_tokens) > 0.60:
            collisions.append(other.message_id)
    signature = diversity_signature(message)
    if collisions:
        return ValidationResult(
            DiversityState.FAILED.value,
            [ValidationFailure("account_hook", "diversity collision above 60% token overlap")],
            collisions,
            signature,
        )
    return ValidationResult(DiversityState.PASSED.value, [], [], signature)

