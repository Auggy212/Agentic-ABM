from __future__ import annotations

from backend.schemas.models import Message, TransportName

from .base import SendResult, Transport


class InstantlyTransport(Transport):
    """Live Instantly EMAIL transport. Wiring deferred to Phase 5b."""

    name = TransportName.INSTANTLY

    def send(self, message: Message) -> SendResult:
        raise NotImplementedError("Live Instantly wiring not implemented (Phase 5b).")
