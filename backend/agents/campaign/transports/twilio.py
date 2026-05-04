from __future__ import annotations

from backend.schemas.models import Message, TransportName

from .base import SendResult, Transport


class TwilioTransport(Transport):
    """Live Twilio WHATSAPP transport. Wiring deferred to Phase 5b."""

    name = TransportName.TWILIO

    def send(self, message: Message) -> SendResult:
        raise NotImplementedError("Live Twilio wiring not implemented (Phase 5b).")
