"""
MockSignalSource — deterministic signal generator for tests and seed scripts.

Returns a fixed set of signals based on a hash of the domain, so the same
domain always produces the same signals. Used when ENV=test or seed=true.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from backend.agents.signal_intel.sources.base import BaseSignalSource
from backend.schemas.models import (
    AccountSignal,
    AccountTier,
    IntentLevel,
    MasterContext,
    SignalSource,
    SignalType,
)

# Ordered so that different hash buckets land in different buying stages
_SIGNAL_TEMPLATES: list[tuple[SignalType, IntentLevel, SignalSource, str]] = [
    (SignalType.FUNDING, IntentLevel.HIGH, SignalSource.CRUNCHBASE, "Raised Series B funding — actively investing in new tooling"),
    (SignalType.RELEVANT_HIRE, IntentLevel.HIGH, SignalSource.LINKEDIN_JOBS, "Hiring VP of Sales — ICP-aligned role open"),
    (SignalType.COMPETITOR_REVIEW, IntentLevel.HIGH, SignalSource.G2, "Employee reviewed a competitor product on G2"),
    (SignalType.EXPANSION, IntentLevel.MEDIUM, SignalSource.GOOGLE_NEWS, "Announced expansion into APAC market"),
    (SignalType.EXEC_CONTENT, IntentLevel.MEDIUM, SignalSource.REDDIT, "CRO posted about pipeline challenges on Reddit"),
    (SignalType.LEADERSHIP_HIRE, IntentLevel.HIGH, SignalSource.LINKEDIN_JOBS, "New CRO appointed — leadership change signal"),
    (SignalType.ICP_MATCH_NO_SIGNAL, IntentLevel.LOW, SignalSource.CRUNCHBASE, "ICP match with no active buying signals detected"),
]

# How many signals each bucket gets (index = hash_bucket)
_BUCKET_COUNTS = [0, 1, 2, 3, 4, 5, 6, 6]  # 8 buckets → 0..7 signals


def _domain_bucket(domain: str, buckets: int = 8) -> int:
    h = int(hashlib.md5(domain.encode()).hexdigest(), 16)
    return h % buckets


def make_mock_signals(
    domain: str,
    tier: AccountTier,
    master_context: MasterContext,
) -> list[AccountSignal]:
    bucket = _domain_bucket(domain)
    count = _BUCKET_COUNTS[bucket]

    # Tier 1 always gets enough signals to be interesting
    if tier == AccountTier.TIER_1 and count < 3:
        count = 3

    signals: list[AccountSignal] = []
    base_time = datetime.now(timezone.utc) - timedelta(days=30)

    for i, (sig_type, intent, source, desc_template) in enumerate(_SIGNAL_TEMPLATES[:count]):
        signals.append(AccountSignal(
            signal_id=uuid.UUID(bytes=hashlib.md5(f"{domain}:{i}".encode()).digest()),
            type=sig_type,
            intent_level=intent,
            description=desc_template,
            source=source,
            source_url=f"https://example.com/signal/{domain.replace('.', '-')}/{i}",
            detected_at=base_time + timedelta(days=i * 4),
            evidence_snippet=f"Evidence for {desc_template[:200]} — detected via {source.value.lower()}"[:500],
        ))

    return signals


class MockSignalSource(BaseSignalSource):
    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        return []  # MockSignalSource is driven externally by make_mock_signals()
