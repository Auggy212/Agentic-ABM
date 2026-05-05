from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from backend.schemas.models import TraceabilityState


@dataclass(frozen=True)
class ValidationFailure:
    layer: str
    reason: str


@dataclass(frozen=True)
class ValidationResult:
    state: TraceabilityState | str
    failures: list[ValidationFailure] = field(default_factory=list)
    collisions: list[UUID] = field(default_factory=list)
    signature: str | None = None

