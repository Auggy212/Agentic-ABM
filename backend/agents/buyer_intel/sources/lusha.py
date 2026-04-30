"""
Lusha contact enrichment adapter.

Phase 2 role: supplement Apollo data for Decision-Makers on Tier 1 accounts only.
Lusha may provide a higher-quality direct-dial number and alternative email.

Free tier: 5 credits/month. Quota enforced by caller via quota_manager("LUSHA").
Only called when: account.tier == TIER_1 AND contact.committee_role == DECISION_MAKER.

API docs: https://www.lusha.com/docs/
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

LUSHA_API_KEY: str = os.environ.get("LUSHA_API_KEY", "")
LUSHA_BASE_URL = "https://api.lusha.com/v1"
_NF = "not_found"


@dataclass
class LushaEnrichment:
    """Incremental enrichment returned by Lusha for a single contact."""
    direct_phone: str    # "not_found" if not available
    work_email: str      # "not_found" if not available


async def enrich_contact(
    first_name: str,
    last_name: str,
    company_domain: str,
) -> LushaEnrichment:
    """
    Enrich a contact using Lusha's person API.

    Returns a LushaEnrichment with whatever Lusha found. Never raises —
    on any error returns "not_found" for all fields.

    Quota must be checked by the caller (quota_manager("LUSHA")) before
    this function is called.
    """
    if not LUSHA_API_KEY:
        logger.warning("LushaSource: LUSHA_API_KEY not set — skipping enrichment")
        return LushaEnrichment(direct_phone=_NF, work_email=_NF)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{LUSHA_BASE_URL}/person",
                headers={"api_key": LUSHA_API_KEY},
                params={
                    "firstName": first_name,
                    "lastName": last_name,
                    "company": company_domain,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "LushaSource HTTP %d for %s %s @ %s: %s",
            exc.response.status_code, first_name, last_name, company_domain,
            exc.response.text[:200],
        )
        return LushaEnrichment(direct_phone=_NF, work_email=_NF)
    except Exception as exc:
        logger.error(
            "LushaSource request failed for %s %s @ %s: %s",
            first_name, last_name, company_domain, exc,
        )
        return LushaEnrichment(direct_phone=_NF, work_email=_NF)

    # Lusha response shape varies; extract defensively
    person = data.get("data") or data
    phones = person.get("phoneNumbers") or []
    emails = person.get("emailAddresses") or []

    direct_phone = _NF
    for ph in phones:
        if isinstance(ph, dict) and ph.get("type") == "direct":
            direct_phone = ph.get("number") or _NF
            break
    if direct_phone == _NF and phones:
        first_ph = phones[0]
        direct_phone = first_ph.get("number") or _NF if isinstance(first_ph, dict) else _NF

    work_email = _NF
    for em in emails:
        if isinstance(em, dict):
            work_email = em.get("email") or _NF
            break

    logger.debug(
        "LushaSource: %s %s @ %s → phone=%s email=%s",
        first_name, last_name, company_domain,
        direct_phone != _NF, work_email != _NF,
    )
    return LushaEnrichment(direct_phone=direct_phone, work_email=work_email)
