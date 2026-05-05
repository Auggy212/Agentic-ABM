"""
Hunter.io email verification adapter.

Phase 2 role: verify emails found by Apollo — do NOT use Hunter to find emails,
only to validate them. Apollo provides the email addresses.

Free tier: 25 verifications/month. Quota enforced by caller via quota_manager("HUNTER").

Tier policy (enforced by BuyerIntelAgent):
  - TIER_1 + TIER_2 contacts: verify via Hunter
  - TIER_3 contacts: skip — email_status stays UNVERIFIED

API docs: https://hunter.io/api-documentation/v2#email-verifier
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

from backend.schemas.models import EmailStatus

logger = logging.getLogger(__name__)

HUNTER_API_KEY: str = os.environ.get("HUNTER_API_KEY", "")
HUNTER_BASE_URL = "https://api.hunter.io/v2"

# Hunter result → EmailStatus mapping
_STATUS_MAP: dict[str, EmailStatus] = {
    "valid":      EmailStatus.VALID,
    "invalid":    EmailStatus.INVALID,
    "accept_all": EmailStatus.CATCH_ALL,
    "unknown":    EmailStatus.RISKY,
    "webmail":    EmailStatus.RISKY,
    "disposable": EmailStatus.INVALID,
}


async def verify_email(email: str) -> EmailStatus:
    """
    Verify a single email address via Hunter.io.

    Returns an EmailStatus enum value. Never raises — on any error returns
    EmailStatus.UNVERIFIED so the contact is not silently dropped.

    Quota must be checked by the caller (quota_manager("HUNTER")) before
    this function is called.
    """
    if not HUNTER_API_KEY:
        logger.warning("HunterSource: HUNTER_API_KEY not set — returning UNVERIFIED")
        return EmailStatus.UNVERIFIED

    if not email or email == "not_found":
        return EmailStatus.NOT_FOUND

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{HUNTER_BASE_URL}/email-verifier",
                params={"email": email, "api_key": HUNTER_API_KEY},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("HunterSource HTTP %d for email=%s: %s",
                     exc.response.status_code, email, exc.response.text[:200])
        return EmailStatus.UNVERIFIED
    except Exception as exc:
        logger.error("HunterSource request failed for email=%s: %s", email, exc)
        return EmailStatus.UNVERIFIED

    result = (data.get("data") or {}).get("result") or ""
    status = _STATUS_MAP.get(result.lower(), EmailStatus.UNVERIFIED)
    logger.debug("HunterSource: email=%s result=%s → %s", email, result, status.value)
    return status
