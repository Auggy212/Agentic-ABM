"""Base class for all signal sources."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.schemas.models import AccountSignal, MasterContext


class BaseSignalSource(ABC):
    """
    Every signal source implements this interface.
    fetch_signals() must never raise — on error return [] and log a warning.
    """

    @abstractmethod
    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: "MasterContext",
    ) -> list["AccountSignal"]:
        """Fetch signals for the given company domain. Returns [] on failure."""
