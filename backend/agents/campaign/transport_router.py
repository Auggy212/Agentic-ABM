from __future__ import annotations

from backend.schemas.models import MessageChannel

from .transports.base import Transport
from .transports.mock import MockInstantly, MockOperatorBrief, MockPhantomBuster, MockTwilio


# Channel -> transport (per phase4_to_phase5_handoff.md table).
CHANNEL_TRANSPORT_MAP: dict[MessageChannel, type[Transport]] = {
    MessageChannel.EMAIL: MockInstantly,
    MessageChannel.LINKEDIN_CONNECTION: MockPhantomBuster,
    MessageChannel.LINKEDIN_DM: MockPhantomBuster,
    MessageChannel.WHATSAPP: MockTwilio,
    MessageChannel.REDDIT_STRATEGY_NOTE: MockOperatorBrief,
}


class TransportRouter:
    """Resolves a Transport instance for a given channel.

    Defaults to mock transports. Pass `transports={MessageChannel.EMAIL: live_inst}`
    to override one or more channels with live wiring (Phase 5b)."""

    def __init__(self, transports: dict[MessageChannel, Transport] | None = None) -> None:
        overrides = transports or {}
        self._instances: dict[MessageChannel, Transport] = {}
        for channel, default_cls in CHANNEL_TRANSPORT_MAP.items():
            self._instances[channel] = overrides.get(channel) or default_cls()

    def for_channel(self, channel: MessageChannel) -> Transport:
        return self._instances[channel]
