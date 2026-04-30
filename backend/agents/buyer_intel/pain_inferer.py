"""
Pain point inferer — pure function, no I/O, no LLM calls.

infer_pain_points(contact, master_context) -> list[InferredPainPoint]

Phase 2 only uses title/department alignment against master_context.buyers.pain_points.
LinkedIn activity data is not available in Phase 2 (recent_activity=[]) — this is
noted explicitly in each reasoning string so the CP2 reviewer knows why pain points
are lower confidence than they will be in Phase 3.

All emitted InferredPainPoint objects carry evidence_status=INFERRED — this is
enforced by the Pydantic model and must never be changed here.
"""

from __future__ import annotations

import re

from backend.agents.icp_scout.sources.apollo import RawContact
from backend.schemas.models import InferredPainPoint, MasterContext

_MIN_WORD_LEN = 4   # ignore short stop-words when matching
_TITLE_CONFIDENCE = 0.60
_DEPT_CONFIDENCE = 0.50


def _significant_words(text: str) -> list[str]:
    return [w.lower() for w in re.split(r"\W+", text) if len(w) >= _MIN_WORD_LEN]


def _overlap_score(a_words: list[str], b_words: list[str]) -> int:
    """Count shared significant words between two word lists."""
    return len(set(a_words) & set(b_words))


def infer_pain_points(
    contact: RawContact,
    master_context: MasterContext,
) -> list[InferredPainPoint]:
    """
    Infer pain points for a contact by matching their title and department
    against master_context.buyers.pain_points.

    Returns at most 3 InferredPainPoint objects — the highest-scoring matches.
    Returns [] if no meaningful overlap is found.

    Note: LinkedIn activity is not used in Phase 2 (always empty). This is
    recorded in every reasoning string so the CP2 reviewer understands the
    confidence ceiling and can expect improvement in Phase 3.
    """
    pain_points: list[str] = master_context.buyers.pain_points
    if not pain_points:
        return []

    title_words = _significant_words(contact.apollo_title)
    dept_words = _significant_words(contact.department)
    contact_words = list(set(title_words + dept_words))

    results: list[tuple[int, InferredPainPoint]] = []

    for pain in pain_points:
        pain_words = _significant_words(pain)
        if not pain_words:
            continue

        title_hits = _overlap_score(title_words, pain_words)
        dept_hits = _overlap_score(dept_words, pain_words)
        total_hits = title_hits + dept_hits

        if total_hits == 0:
            continue

        # Confidence: title alignment is stronger signal than department alone
        if title_hits > 0:
            confidence = _TITLE_CONFIDENCE
            source_detail = f"title '{contact.apollo_title}'"
        else:
            confidence = _DEPT_CONFIDENCE
            source_detail = f"department '{contact.department}'"

        reasoning_suffix = (
            " LinkedIn activity not available in Phase 2 — "
            "confidence will increase after Phase 3 PhantomBuster enrichment."
        )

        results.append((
            total_hits,
            InferredPainPoint(
                pain_point=f"[INFERRED] {pain}",
                source="title_alignment",
                confidence=confidence,
            ),
        ))

    # Sort by hit count descending, return top 3
    results.sort(key=lambda x: x[0], reverse=True)
    return [pp for _, pp in results[:3]]
