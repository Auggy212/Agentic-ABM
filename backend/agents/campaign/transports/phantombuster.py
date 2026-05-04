from __future__ import annotations

from backend.schemas.models import Message, TransportName

from .base import SendResult, Transport


class PhantomBusterTransport(Transport):
    """Live PhantomBuster LINKEDIN_* transport. Wiring deferred to Phase 5b."""

    name = TransportName.PHANTOMBUSTER

    def send(self, message: Message) -> SendResult:
        raise NotImplementedError("Live PhantomBuster wiring not implemented (Phase 5b).")
