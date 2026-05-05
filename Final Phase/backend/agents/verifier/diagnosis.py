"""Deliverability target-miss diagnosis for Phase 3."""

from __future__ import annotations

from typing import Optional

from backend.schemas.models import PerSourceBreakdown, SourceBreakdown

_ACTIONS = {
    "apollo": "Tighten ICP filters - Apollo's free-tier coverage degrades on niche industries.",
    "hunter": "Reduce Hunter re-lookup volume; quota exhaustion correlates with stale data.",
    "clay": "Re-run Clay enrichment - flow may have stalled mid-batch.",
    "linkedin_manual": "Audit manual LinkedIn entries for stale or malformed emails.",
}


def _iter_sources(
    per_source_breakdown: PerSourceBreakdown,
) -> list[tuple[str, SourceBreakdown]]:
    sources: list[tuple[str, SourceBreakdown]] = [
        ("apollo", per_source_breakdown.apollo),
        ("hunter", per_source_breakdown.hunter),
    ]
    if per_source_breakdown.clay is not None:
        sources.append(("clay", per_source_breakdown.clay))
    if per_source_breakdown.linkedin_manual is not None:
        sources.append(("linkedin_manual", per_source_breakdown.linkedin_manual))
    return sources


def diagnose_target_miss(per_source_breakdown: PerSourceBreakdown) -> str:
    candidates = [
        (name, breakdown)
        for name, breakdown in _iter_sources(per_source_breakdown)
        if breakdown.total > 0
    ]
    if not candidates:
        return (
            "Deliverability 0% missed 90% target. Lowest-quality source: unknown at 0% "
            "(0 of 0 invalid). Recommended: Verify source ingestion before launch."
        )

    source, breakdown = min(candidates, key=lambda item: item[1].pass_rate)
    rate_pct = round(breakdown.pass_rate * 100)
    invalid_count = breakdown.invalid
    action = _ACTIONS.get(source, "Inspect enrichment logs for stale or incomplete data.")

    return (
        f"Deliverability {rate_pct}% missed 90% target. "
        f"Lowest-quality source: {source} at {rate_pct}% "
        f"({invalid_count} of {breakdown.total} invalid). "
        f"Recommended: {action}"
    )
