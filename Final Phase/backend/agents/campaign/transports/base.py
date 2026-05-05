from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from backend.schemas.models import Message, SendStatus, TransportName


class QuotaExhaustedError(Exception):
    """Raised by a transport (or its quota_manager wrapper) when the upstream
    free-tier quota is exhausted. Master prompt §3 / Anti-pattern §9: never
    silently fall back to another transport — surface and let the caller mark
    the message PENDING_QUOTA_RESET."""

    def __init__(self, source: str, message: str = "") -> None:
        super().__init__(f"{source} quota exhausted: {message}" if message else f"{source} quota exhausted")
        self.source = source


class TransportAuthError(Exception):
    """Raised on transport-side auth failure (Instantly/PB/Twilio creds bad).
    Per Phase 5 decision: hard global_halt across all accounts."""

    def __init__(self, source: str, message: str = "") -> None:
        super().__init__(f"{source} auth failure: {message}" if message else f"{source} auth failure")
        self.source = source


@dataclass
class SendResult:
    status: SendStatus
    provider_message_id: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    raw_response: dict = field(default_factory=dict)


class Transport(ABC):
    """Channel-bound transport adapter. Phase 5 wires concrete clients
    (Instantly/PhantomBuster/Twilio) behind this interface."""

    name: TransportName

    @abstractmethod
    def send(self, message: Message) -> SendResult: ...
