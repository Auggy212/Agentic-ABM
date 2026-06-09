from __future__ import annotations

import os
import uuid

from backend.schemas.models import Message, SendStatus, TransportName

from .base import QuotaExhaustedError, SendResult, Transport, TransportAuthError


class _MockTransport(Transport):
    """Deterministic test transport. Behaviour is driven by env flags so tests
    can simulate quota exhaustion, auth failure, and bounce floods without
    monkey-patching internals."""

    name: TransportName
    fail_env: str = ""
    quota_env: str = ""
    auth_env: str = ""
    bounce_env: str = ""

    def send(self, message: Message) -> SendResult:
        if self.auth_env and os.environ.get(self.auth_env) == "1":
            raise TransportAuthError(self.name.value, "mock auth failure")
        if self.quota_env and os.environ.get(self.quota_env) == "1":
            raise QuotaExhaustedError(self.name.value, "mock quota exhausted")
        if self.bounce_env and os.environ.get(self.bounce_env) == "1":
            return SendResult(
                status=SendStatus.FAILED,
                error_code="BOUNCE",
                error_message="hard bounce (mock)",
            )
        if self.fail_env and os.environ.get(self.fail_env) == "1":
            return SendResult(
                status=SendStatus.FAILED,
                error_code="MOCK_FAIL",
                error_message="generic mock failure",
            )
        return SendResult(
            status=SendStatus.SENT,
            provider_message_id=f"mock-{self.name.value.lower()}-{uuid.uuid4().hex[:12]}",
        )


class MockInstantly(_MockTransport):
    name = TransportName.INSTANTLY
    fail_env = "MOCK_INSTANTLY_FAIL"
    quota_env = "MOCK_INSTANTLY_QUOTA"
    auth_env = "MOCK_INSTANTLY_AUTH_FAIL"
    bounce_env = "MOCK_INSTANTLY_BOUNCE"


class MockPhantomBuster(_MockTransport):
    name = TransportName.PHANTOMBUSTER
    fail_env = "MOCK_PB_FAIL"
    quota_env = "MOCK_PB_QUOTA"
    auth_env = "MOCK_PB_AUTH_FAIL"


class MockTwilio(_MockTransport):
    name = TransportName.TWILIO
    fail_env = "MOCK_TWILIO_FAIL"
    quota_env = "MOCK_TWILIO_QUOTA"
    auth_env = "MOCK_TWILIO_AUTH_FAIL"


class MockOperatorBrief(Transport):
    """REDDIT_STRATEGY_NOTE channel — never auto-sent. Always 'queued for operator brief'."""

    name = TransportName.OPERATOR_BRIEF

    def send(self, message: Message) -> SendResult:
        return SendResult(status=SendStatus.QUEUED, provider_message_id=f"brief-{message.message_id}")
