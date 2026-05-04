"""Deterministic mock verifier sources for Phase 3 seed data."""

from __future__ import annotations

import hashlib

from backend.schemas.models import EmailFinalStatus


def _bucket(value: str) -> int:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


class MockNeverBounce:
    def check(self, email: str) -> dict:
        bucket = _bucket(email)
        if bucket < 70:
            return {"result": "valid", "confidence": 0.97}
        if bucket < 85:
            return {"result": "catchall", "confidence": 0.62}
        if bucket < 90:
            return {"result": "unknown", "confidence": 0.44}
        if bucket < 98:
            return {"result": "invalid", "confidence": 0.95}
        return {"result": "invalid", "confidence": 0.91, "sub_status": "mailbox_not_found"}


class MockZeroBounce:
    def check(self, email: str) -> dict:
        bucket = _bucket(f"zb:{email}")
        if bucket < 65:
            return {"status": "valid", "confidence": 0.92}
        if bucket < 80:
            return {"status": "do_not_mail", "confidence": 0.51}
        return {"status": "catch-all", "confidence": 0.68}


class MockHunter:
    def find(self, domain: str, full_name: str) -> str | None:
        bucket = _bucket(f"hunter:{domain}:{full_name}")
        if bucket < 60:
            slug = ".".join(part.lower() for part in full_name.split()[:2])
            return f"{slug}@{domain}"
        return None


def expected_final_status(email: str) -> EmailFinalStatus:
    nb = MockNeverBounce().check(email)["result"]
    if nb == "valid":
        return EmailFinalStatus.VALID
    if nb == "catchall":
        zb = MockZeroBounce().check(email)["status"]
        if zb == "valid":
            return EmailFinalStatus.VALID
        if zb == "catch-all":
            return EmailFinalStatus.CATCH_ALL
        return EmailFinalStatus.RISKY
    if nb == "unknown":
        return EmailFinalStatus.RISKY
    return EmailFinalStatus.INVALID
