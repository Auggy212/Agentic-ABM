"""
Client upload source adapter.

When master_context.gtm.existing_account_list is non-null (a CSV path/reference),
this adapter loads and normalises the rows — skipping API discovery entirely.

CSV schema: "Company Name" (required), "Website" (required), plus any optional
enrichment columns. Missing fields become "not_found" per the data quality rule.
"""

from __future__ import annotations

import csv
import io
import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from backend.agents.icp_scout.scoring import RawCompany, RawFundingRound
from backend.agents.icp_scout.sources.base import BaseSource, ICPFilters
from backend.schemas.models import DataSource

logger = logging.getLogger(__name__)

_NF = "not_found"


def _extract_domain(website: str) -> str:
    domain = website.strip().lower()
    for prefix in ("https://", "http://"):
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
    domain = domain.lstrip("www.").rstrip("/").split("/")[0]
    return domain


def _row_to_company(row: dict) -> Optional[RawCompany]:
    name = (row.get("Company Name") or row.get("company_name") or "").strip()
    website = (row.get("Website") or row.get("website") or "").strip()
    if not name or not website:
        return None
    if not website.startswith("http"):
        website = f"https://{website}"

    domain = _extract_domain(website)
    if not domain:
        return None

    headcount_raw = row.get("Headcount") or row.get("Employees") or row.get("headcount")
    headcount: int | str = _NF
    if headcount_raw:
        try:
            headcount = int(str(headcount_raw).replace(",", "").strip())
        except ValueError:
            headcount = _NF

    return RawCompany(
        domain=domain,
        company_name=name,
        website=website,
        linkedin_url=row.get("LinkedIn URL") or row.get("linkedin_url") or None,
        industry=row.get("Industry") or row.get("industry") or _NF,
        headcount=headcount,
        estimated_arr=row.get("Estimated ARR") or row.get("estimated_arr") or _NF,
        funding_stage=row.get("Funding Stage") or row.get("funding_stage") or _NF,
        last_funding_round=RawFundingRound(round=_NF, amount_usd=_NF, date=_NF),
        hq_location=row.get("HQ Location") or row.get("location") or _NF,
        technologies_used=[],
        recent_signals=[],
        source=DataSource.CLIENT_UPLOAD,
        enriched_at=datetime.now(tz=timezone.utc),
    )


class ClientUploadSource(BaseSource):
    """
    Loads companies from the client's pre-uploaded CSV instead of calling APIs.
    The CSV must already exist on disk at the path stored in
    master_context.gtm.existing_account_list.
    """

    source_id = DataSource.CLIENT_UPLOAD

    def __init__(self, csv_path: str) -> None:
        self._csv_path = csv_path

    async def search(self, filters: ICPFilters) -> List[RawCompany]:
        if not self._csv_path:
            return []

        # Support in-memory bytes path (e.g. from test) or real filesystem path
        if isinstance(self._csv_path, (bytes, bytearray)):
            content = self._csv_path.decode("utf-8-sig")
        elif os.path.isfile(self._csv_path):
            with open(self._csv_path, encoding="utf-8-sig") as fh:
                content = fh.read()
        else:
            logger.error("ClientUploadSource: file not found: %r", self._csv_path)
            return []

        results: List[RawCompany] = []
        reader = csv.DictReader(io.StringIO(content))
        for i, row in enumerate(reader, start=2):
            company = _row_to_company(row)
            if company:
                results.append(company)
            else:
                logger.debug("ClientUploadSource: skipped row %d (missing name or website)", i)

        logger.info("ClientUploadSource: loaded %d companies from %r", len(results), self._csv_path)
        return results
