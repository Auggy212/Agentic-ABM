"""
Common interface for all ICP Scout data sources.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List

from pydantic import BaseModel

from backend.agents.icp_scout.scoring import RawCompany
from backend.schemas.models import DataSource


@dataclass
class ICPFilters:
    """
    Source-agnostic search filters built from master_context.icp.
    Each source adapter maps these to its own API query parameters.
    """
    industries: List[str] = field(default_factory=list)
    employee_range: tuple[int, int] | None = None        # (lo, hi) parsed from company_size_employees
    locations: List[str] = field(default_factory=list)
    technologies: List[str] = field(default_factory=list)
    funding_stages: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)    # extra terms for sources that support it


class BaseSource(ABC):
    """
    Every source adapter implements this interface.
    The pipeline calls search() and gets back a list of normalised RawCompany objects.
    """

    source_id: DataSource  # must be set by each subclass

    @abstractmethod
    async def search(self, filters: ICPFilters) -> List[RawCompany]:
        """
        Query the data source and return normalised RawCompany records.

        - Missing fields MUST be set to "not_found" (literal string), never fabricated.
        - Partial records are acceptable — the scorer handles missing data gracefully.
        - Must not raise QuotaExhaustedError internally; let the quota manager do that.
        """
        ...
