"""
Two-stage Phase 3 email verification.

NeverBounce is the primary engine. ZeroBounce is called only for ambiguous
NeverBounce outcomes (`CATCH_ALL` or `RISKY`) unless NeverBounce quota is
exhausted, in which case ZeroBounce is used loudly as a primary fallback.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from backend.agents.icp_scout.sources.quota_manager import (
    SOURCE_MONTHLY_LIMITS,
    QuotaExhaustedError,
    check_and_increment,
    get_usage,
)
from backend.agents.verifier.relookup import HunterRelookupService
from backend.schemas.models import (
    EmailEngineResult,
    EmailFinalStatus,
    EmailVerification,
    EngineName,
    RelookupBlockedReason,
    RelookupSource,
)

logger = logging.getLogger(__name__)

NEVERBOUNCE_API_KEY: str = os.environ.get("NEVERBOUNCE_API_KEY", "")
ZEROBOUNCE_API_KEY: str = os.environ.get("ZEROBOUNCE_API_KEY", "")
NEVERBOUNCE_BASE_URL = "https://api.neverbounce.com/v4"
ZEROBOUNCE_BASE_URL = "https://api.zerobounce.net/v2"

NEVERBOUNCE_SOURCE = "NEVERBOUNCE"
ZEROBOUNCE_SOURCE = "ZEROBOUNCE"


_NEVERBOUNCE_STATUS_MAP: dict[str, tuple[EmailFinalStatus, str]] = {
    "valid": (EmailFinalStatus.VALID, ""),
    "invalid": (EmailFinalStatus.INVALID, ""),
    "disposable": (EmailFinalStatus.INVALID, "disposable"),
    "catchall": (EmailFinalStatus.CATCH_ALL, ""),
    "catch_all": (EmailFinalStatus.CATCH_ALL, ""),
    "unknown": (EmailFinalStatus.RISKY, ""),
}

_ZEROBOUNCE_STATUS_MAP: dict[str, tuple[EmailFinalStatus, str]] = {
    "valid": (EmailFinalStatus.VALID, ""),
    "invalid": (EmailFinalStatus.INVALID, ""),
    "catch-all": (EmailFinalStatus.CATCH_ALL, ""),
    "catch_all": (EmailFinalStatus.CATCH_ALL, ""),
    "spamtrap": (EmailFinalStatus.INVALID, "spamtrap"),
    "abuse": (EmailFinalStatus.INVALID, "abuse"),
    "do_not_mail": (EmailFinalStatus.RISKY, ""),
    "unknown": (EmailFinalStatus.RISKY, ""),
}

_DEFAULT_CONFIDENCE: dict[EmailFinalStatus, float] = {
    EmailFinalStatus.VALID: 0.95,
    EmailFinalStatus.INVALID: 0.95,
    EmailFinalStatus.CATCH_ALL: 0.70,
    EmailFinalStatus.RISKY: 0.50,
    EmailFinalStatus.NOT_FOUND: 1.0,
}


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _remaining(source: str) -> int:
    limit = SOURCE_MONTHLY_LIMITS.get(source, -1)
    if limit < 0:
        return 0
    return max(limit - get_usage(source), 0)


def neverbounce_remaining() -> int:
    return _remaining(NEVERBOUNCE_SOURCE)


def zerobounce_remaining() -> int:
    return _remaining(ZEROBOUNCE_SOURCE)


class EmailVerifier:
    def __init__(
        self,
        *,
        neverbounce_api_key: Optional[str] = None,
        zerobounce_api_key: Optional[str] = None,
        relookup_service: Optional[HunterRelookupService] = None,
    ) -> None:
        self.neverbounce_api_key = (
            neverbounce_api_key if neverbounce_api_key is not None else NEVERBOUNCE_API_KEY
        )
        self.zerobounce_api_key = (
            zerobounce_api_key if zerobounce_api_key is not None else ZEROBOUNCE_API_KEY
        )
        self.relookup_service = relookup_service or HunterRelookupService()
        self.neverbounce_used_this_run = 0
        self.zerobounce_used_this_run = 0
        self.warnings: list[str] = []

    async def verify_email(
        self,
        email: str,
        *,
        domain: Optional[str] = None,
        full_name: Optional[str] = None,
        allow_relookup: bool = True,
    ) -> EmailVerification:
        if not email:
            result = EmailEngineResult(
                status=EmailFinalStatus.NOT_FOUND,
                confidence=1.0,
                sub_status="email_missing",
                checked_at=_now(),
            )
            return EmailVerification(
                email=email,
                status=EmailFinalStatus.NOT_FOUND,
                primary_engine=EngineName.NEVERBOUNCE,
                secondary_engine=None,
                primary_result=result,
                secondary_result=None,
                relookup_attempted=False,
                relookup_source=None,
                relookup_email=None,
                relookup_blocked_reason=None,
                final_status=EmailFinalStatus.NOT_FOUND,
            )

        primary_engine = EngineName.NEVERBOUNCE
        try:
            primary_result = await self._verify_with_neverbounce(email)
        except QuotaExhaustedError:
            warning = (
                "NeverBounce quota exhausted; ZeroBounce used as primary fallback. "
                "Engine swap is explicit and recorded."
            )
            logger.warning("Verifier: %s", warning)
            self.warnings.append(warning)
            primary_engine = EngineName.ZEROBOUNCE
            primary_result = await self._verify_with_zerobounce_primary(email)

        secondary_engine: Optional[EngineName] = None
        secondary_result: Optional[EmailEngineResult] = None
        final_status = primary_result.status

        if (
            primary_engine == EngineName.NEVERBOUNCE
            and primary_result.status in {EmailFinalStatus.CATCH_ALL, EmailFinalStatus.RISKY}
        ):
            try:
                secondary_engine = EngineName.ZEROBOUNCE
                secondary_result = await self._verify_with_zerobounce(email)
                final_status = secondary_result.status
            except QuotaExhaustedError:
                warning = (
                    "ZeroBounce quota exhausted; ambiguous NeverBounce result left as RISKY."
                )
                logger.warning("Verifier: %s", warning)
                self.warnings.append(warning)
                secondary_engine = None
                secondary_result = None
                final_status = EmailFinalStatus.RISKY

        verification = EmailVerification(
            email=email,
            status=primary_result.status,
            primary_engine=primary_engine,
            secondary_engine=secondary_engine,
            primary_result=primary_result,
            secondary_result=secondary_result,
            relookup_attempted=False,
            relookup_source=None,
            relookup_email=None,
            relookup_blocked_reason=None,
            final_status=final_status,
        )

        if (
            verification.final_status == EmailFinalStatus.INVALID
            and allow_relookup
            and domain
            and full_name
        ):
            lookup = await self.relookup_service.relookup(
                domain=domain,
                full_name=full_name,
                original_email=email,
                email_verifier=self,
            )
            relookup_final = lookup.final_status or verification.final_status
            if lookup.email and lookup.final_status != EmailFinalStatus.INVALID:
                relookup_final = lookup.final_status or EmailFinalStatus.RISKY
            verification = verification.model_copy(
                update={
                    "relookup_attempted": lookup.attempted,
                    "relookup_source": RelookupSource.HUNTER if lookup.attempted else None,
                    "relookup_email": lookup.email,
                    "relookup_blocked_reason": lookup.blocked_reason,
                    "final_status": relookup_final,
                }
            )

        return verification

    def drain_warnings(self) -> list[str]:
        warnings = self.warnings[:]
        self.warnings.clear()
        return warnings

    async def _verify_with_neverbounce(self, email: str) -> EmailEngineResult:
        if not self.neverbounce_api_key:
            logger.warning("EmailVerifier: NEVERBOUNCE_API_KEY not set")
            return self._synthetic_result(EmailFinalStatus.RISKY, "neverbounce_api_key_missing")

        check_and_increment(NEVERBOUNCE_SOURCE)
        self.neverbounce_used_this_run += 1
        data = await self._call_with_backoff(
            self._call_neverbounce,
            email,
            provider=NEVERBOUNCE_SOURCE,
        )
        return self._map_neverbounce(data)

    async def _verify_with_zerobounce(self, email: str) -> EmailEngineResult:
        if not self.zerobounce_api_key:
            logger.warning("EmailVerifier: ZEROBOUNCE_API_KEY not set")
            raise QuotaExhaustedError(
                ZEROBOUNCE_SOURCE,
                SOURCE_MONTHLY_LIMITS.get(ZEROBOUNCE_SOURCE, 0),
                SOURCE_MONTHLY_LIMITS.get(ZEROBOUNCE_SOURCE, 0),
                _now().date(),
            )

        check_and_increment(ZEROBOUNCE_SOURCE)
        self.zerobounce_used_this_run += 1
        data = await self._call_with_backoff(
            self._call_zerobounce,
            email,
            provider=ZEROBOUNCE_SOURCE,
        )
        return self._map_zerobounce(data)

    async def _verify_with_zerobounce_primary(self, email: str) -> EmailEngineResult:
        try:
            return await self._verify_with_zerobounce(email)
        except QuotaExhaustedError:
            return self._synthetic_result(
                EmailFinalStatus.RISKY,
                "all_email_verification_quota_exhausted",
            )

    async def _call_neverbounce(self, email: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{NEVERBOUNCE_BASE_URL}/single/check",
                params={"key": self.neverbounce_api_key, "email": email},
            )
            if resp.status_code == 429:
                raise httpx.HTTPStatusError("rate limited", request=resp.request, response=resp)
            resp.raise_for_status()
            return resp.json()

    async def _call_zerobounce(self, email: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{ZEROBOUNCE_BASE_URL}/validate",
                params={"api_key": self.zerobounce_api_key, "email": email},
            )
            if resp.status_code == 429:
                raise httpx.HTTPStatusError("rate limited", request=resp.request, response=resp)
            resp.raise_for_status()
            return resp.json()

    async def _call_with_backoff(self, call, email: str, *, provider: str) -> dict[str, Any]:
        delay = 0.5
        for attempt in range(4):
            try:
                return await call(email)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 429 or attempt == 3:
                    raise
                logger.warning("%s rate limited; backing off %.1fs", provider, delay)
                await asyncio.sleep(delay)
                delay *= 2
        raise RuntimeError("unreachable backoff state")

    def _map_neverbounce(self, data: dict[str, Any]) -> EmailEngineResult:
        raw = str(data.get("result") or data.get("status") or "unknown").lower()
        status, mapped_sub_status = _NEVERBOUNCE_STATUS_MAP.get(
            raw, (EmailFinalStatus.RISKY, raw)
        )
        sub_status = str(data.get("sub_status") or mapped_sub_status or "")
        confidence = float(data.get("confidence") or _DEFAULT_CONFIDENCE[status])
        return EmailEngineResult(
            status=status,
            confidence=max(min(confidence, 1.0), 0.0),
            sub_status=sub_status,
            checked_at=_now(),
        )

    def _map_zerobounce(self, data: dict[str, Any]) -> EmailEngineResult:
        raw = str(data.get("status") or data.get("result") or "unknown").lower()
        status, mapped_sub_status = _ZEROBOUNCE_STATUS_MAP.get(
            raw, (EmailFinalStatus.RISKY, raw)
        )
        sub_status = str(data.get("sub_status") or mapped_sub_status or "")
        confidence = float(data.get("confidence") or _DEFAULT_CONFIDENCE[status])
        return EmailEngineResult(
            status=status,
            confidence=max(min(confidence, 1.0), 0.0),
            sub_status=sub_status,
            checked_at=_now(),
        )

    def _synthetic_result(self, status: EmailFinalStatus, sub_status: str) -> EmailEngineResult:
        return EmailEngineResult(
            status=status,
            confidence=_DEFAULT_CONFIDENCE[status],
            sub_status=sub_status,
            checked_at=_now(),
        )


_default_verifier = EmailVerifier()


async def verify_email(email: str) -> EmailVerification:
    return await _default_verifier.verify_email(email)
