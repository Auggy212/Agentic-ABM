"""
Hunter.io re-lookup for Phase 3 invalid emails.

The Verifier only uses Hunter when an existing email has already failed the
NeverBounce / ZeroBounce pipeline. Hunter finds a replacement address at the
same domain; that candidate is then sent through the same verification pipeline.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Optional, Protocol

import httpx

from backend.agents.icp_scout.sources.quota_manager import (
    QUOTA_TTL_SECONDS,
    SOURCE_MONTHLY_LIMITS,
    QuotaExhaustedError,
    check_and_increment,
    get_usage,
)
from backend.schemas.models import EmailFinalStatus, RelookupBlockedReason

logger = logging.getLogger(__name__)

HUNTER_API_KEY: str = os.environ.get("HUNTER_API_KEY", "")
HUNTER_BASE_URL = "https://api.hunter.io/v2"
HUNTER_SOURCE = "HUNTER"
HUNTER_MIN_REMAINING_FOR_RELOOKUP = 5


class EmailVerifierProtocol(Protocol):
    async def verify_email(
        self,
        email: str,
        *,
        domain: Optional[str] = None,
        full_name: Optional[str] = None,
        allow_relookup: bool = True,
    ):
        ...


@dataclass
class RelookupResult:
    attempted: bool
    email: Optional[str] = None
    blocked_reason: Optional[RelookupBlockedReason] = None
    final_status: Optional[EmailFinalStatus] = None


def _split_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in full_name.strip().split() if p]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[-1]


def hunter_remaining_quota() -> int:
    limit = SOURCE_MONTHLY_LIMITS.get(HUNTER_SOURCE, -1)
    if limit < 0:
        return QUOTA_TTL_SECONDS
    return max(limit - get_usage(HUNTER_SOURCE), 0)


class HunterRelookupService:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key if api_key is not None else HUNTER_API_KEY
        self.used_this_run = 0

    async def relookup(
        self,
        domain: str,
        full_name: str,
        *,
        original_email: Optional[str] = None,
        email_verifier: Optional[EmailVerifierProtocol] = None,
    ) -> RelookupResult:
        if hunter_remaining_quota() < HUNTER_MIN_REMAINING_FOR_RELOOKUP:
            logger.warning(
                "Verifier Hunter relookup skipped: fewer than %d calls remain",
                HUNTER_MIN_REMAINING_FOR_RELOOKUP,
            )
            return RelookupResult(
                attempted=True,
                blocked_reason=RelookupBlockedReason.QUOTA_EXHAUSTED,
            )

        try:
            check_and_increment(HUNTER_SOURCE)
            self.used_this_run += 1
        except QuotaExhaustedError:
            logger.warning("Verifier Hunter relookup skipped: quota exhausted")
            return RelookupResult(
                attempted=True,
                blocked_reason=RelookupBlockedReason.QUOTA_EXHAUSTED,
            )

        candidate = await self._call_hunter(domain=domain, full_name=full_name)
        if not candidate or candidate == original_email:
            return RelookupResult(
                attempted=True,
                blocked_reason=RelookupBlockedReason.NO_MATCH,
            )

        if email_verifier is None:
            return RelookupResult(attempted=True, email=candidate)

        verified = await email_verifier.verify_email(
            candidate,
            domain=domain,
            full_name=full_name,
            allow_relookup=False,
        )
        if verified.final_status == EmailFinalStatus.INVALID:
            return RelookupResult(
                attempted=True,
                email=candidate,
                final_status=EmailFinalStatus.INVALID,
            )

        return RelookupResult(
            attempted=True,
            email=candidate,
            final_status=verified.final_status,
        )

    async def _call_hunter(self, *, domain: str, full_name: str) -> Optional[str]:
        if not self.api_key:
            logger.warning("HunterRelookupService: HUNTER_API_KEY not set")
            return None

        first_name, last_name = _split_name(full_name)
        if not domain or not first_name:
            return None

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{HUNTER_BASE_URL}/email-finder",
                    params={
                        "domain": domain,
                        "first_name": first_name,
                        "last_name": last_name,
                        "api_key": self.api_key,
                    },
                )
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "HunterRelookupService HTTP %d for domain=%s: %s",
                exc.response.status_code,
                domain,
                exc.response.text[:200],
            )
            return None
        except Exception as exc:
            logger.error("HunterRelookupService request failed for domain=%s: %s", domain, exc)
            return None

        email = (data.get("data") or {}).get("email")
        return email if isinstance(email, str) and email else None


_default_service = HunterRelookupService()


async def relookup(domain: str, full_name: str) -> RelookupResult:
    return await _default_service.relookup(domain=domain, full_name=full_name)
