"""
Committee role mapper — pure, deterministic, rule-based.

map_committee_role(contact, master_context) -> (CommitteeRole, confidence, reasoning)

Rules fire in priority order:
  1. DECISION_MAKER — C-suite title tokens OR (VP + buyer-aligned department)
  2. BLOCKER         — Procurement/Legal/IT-Security/Finance at Director+ seniority
  3. CHAMPION        — close title match to ICP buyer titles AND Director/Manager seniority
  4. INFLUENCER      — default when no other rule fires

confidence levels:
  exact_match    → 0.95  (C-suite token in title, or exact title match)
  partial_match  → 0.70  (VP + department alignment, or close title partial match)
  inferred       → 0.40  (default INFLUENCER or BLOCKER by department heuristic only)

The reasoning string is a single sentence explaining which rule fired — surfaced
in the CP2 review UI for human audit. Never use an LLM here; must be deterministic.
"""

from __future__ import annotations

import re
from typing import Optional

from backend.agents.icp_scout.sources.apollo import RawContact
from backend.schemas.models import CommitteeRole, MasterContext, Seniority

# ---------------------------------------------------------------------------
# Lookup tables
# ---------------------------------------------------------------------------

_C_SUITE_TOKENS: frozenset[str] = frozenset({
    "ceo", "cfo", "cro", "coo", "cto", "cmo", "chro", "cpo", "ciso",
    "chief executive", "chief financial", "chief revenue", "chief operating",
    "chief technology", "chief marketing", "chief product", "chief information",
    "founder", "co-founder", "managing director", "managing partner",
    "president", "owner",
})

_BLOCKER_DEPARTMENTS: frozenset[str] = frozenset({
    "procurement", "legal", "it security", "it-security", "itsecurity",
    "information security", "infosec", "finance", "compliance",
    "risk", "audit", "purchasing", "vendor management",
})

_SENIORITY_RANK: dict[str, int] = {
    "c_suite":               5,
    "owner":                 5,
    "founder":               5,
    "vp":                    4,
    "vice president":        4,
    "director":              3,
    "senior director":       3,
    "head":                  3,
    "manager":               2,
    "senior manager":        2,
    "individual_contributor": 1,
    "unknown":               0,
}

# Minimum seniority rank to qualify as BLOCKER
_BLOCKER_MIN_RANK = 3  # Director+


def _normalise(s: str) -> str:
    return s.strip().lower()


def _title_contains(title: str, tokens: frozenset[str]) -> bool:
    title_n = _normalise(title)
    for tok in tokens:
        if len(tok) <= 4:
            # Short tokens (ceo, cfo, cto, cmo, cpo, coo, cro, vp…) must match
            # as whole words to avoid false hits like "cto" inside "director".
            if re.search(r"\b" + re.escape(tok) + r"\b", title_n):
                return True
        else:
            if tok in title_n:
                return True
    return False


def _seniority_rank(seniority_label: str, title: str) -> int:
    """
    Resolve a numeric rank from Apollo's seniority string + the raw title.
    Title is also checked so that titles like "CTO" are caught even when
    Apollo's seniority field is blank.
    """
    label_n = _normalise(seniority_label)
    for key, rank in _SENIORITY_RANK.items():
        if key in label_n:
            return rank
    # Fallback: check the title itself for VP / Director / Manager tokens
    title_n = _normalise(title)
    if any(t in title_n for t in ("vp", "vice president")):
        return 4
    if any(t in title_n for t in ("director", "head of")):
        return 3
    if "manager" in title_n:
        return 2
    return 0


def _department_aligns_with_icp(department: str, icp_titles: list[str]) -> bool:
    """
    Return True if the contact's department name overlaps with any ICP buyer
    title keyword (e.g. department="Sales", icp_titles=["VP Sales", "CRO"]).
    """
    dept_n = _normalise(department)
    for title in icp_titles:
        title_n = _normalise(title)
        # Each word in the ICP title that is longer than 3 chars
        words = [w for w in re.split(r"\W+", title_n) if len(w) > 3]
        if any(w in dept_n for w in words):
            return True
    return False


def _best_title_match(contact_title: str, icp_titles: list[str]) -> tuple[bool, bool]:
    """
    Returns (exact_match, partial_match) against ICP buyer titles.
    exact   — contact_title exactly equals an ICP title (case-insensitive)
    partial — at least one significant word from an ICP title appears in contact_title
    """
    ct_n = _normalise(contact_title)
    for icp in icp_titles:
        icp_n = _normalise(icp)
        if ct_n == icp_n:
            return True, True
        words = [w for w in re.split(r"\W+", icp_n) if len(w) > 3]
        if words and any(w in ct_n for w in words):
            return False, True
    return False, False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def map_committee_role(
    contact: RawContact,
    master_context: MasterContext,
) -> tuple[CommitteeRole, float, str]:
    """
    Assign a buying-committee role to a contact.

    Returns:
        (CommitteeRole, confidence: float 0.0–1.0, reasoning: str)

    Rules fire in priority order — first match wins.
    """
    title = contact.apollo_title
    seniority = contact.seniority_label
    department = contact.department
    icp_titles: list[str] = master_context.buyers.titles

    rank = _seniority_rank(seniority, title)

    # -----------------------------------------------------------------------
    # Rule 1 — DECISION_MAKER
    # -----------------------------------------------------------------------
    if _title_contains(title, _C_SUITE_TOKENS):
        return (
            CommitteeRole.DECISION_MAKER,
            0.95,
            f"Title '{title}' contains a C-suite token — assigned DECISION_MAKER (exact match).",
        )

    if rank >= 4 and _department_aligns_with_icp(department, icp_titles):
        return (
            CommitteeRole.DECISION_MAKER,
            0.70,
            f"VP-level seniority with department '{department}' aligned to ICP buyer titles "
            f"{icp_titles[:2]} — assigned DECISION_MAKER (partial match).",
        )

    # -----------------------------------------------------------------------
    # Rule 2 — BLOCKER
    # -----------------------------------------------------------------------
    dept_n = _normalise(department)
    is_blocker_dept = any(bd in dept_n for bd in _BLOCKER_DEPARTMENTS)
    if is_blocker_dept and rank >= _BLOCKER_MIN_RANK:
        return (
            CommitteeRole.BLOCKER,
            0.70,
            f"Department '{department}' is a known gate-keeping function and seniority "
            f"rank={rank} ≥ Director — assigned BLOCKER (partial match).",
        )

    # -----------------------------------------------------------------------
    # Rule 3 — CHAMPION
    # -----------------------------------------------------------------------
    if rank in (2, 3):  # MANAGER or DIRECTOR
        exact, partial = _best_title_match(title, icp_titles)
        if exact:
            return (
                CommitteeRole.CHAMPION,
                0.95,
                f"Title '{title}' exactly matches an ICP buyer title at Director/Manager level "
                f"— assigned CHAMPION (exact match).",
            )
        if partial:
            return (
                CommitteeRole.CHAMPION,
                0.70,
                f"Title '{title}' partially matches ICP buyer titles {icp_titles[:2]} at "
                f"Director/Manager level — assigned CHAMPION (partial match).",
            )

    # -----------------------------------------------------------------------
    # Rule 4 — INFLUENCER (default)
    # -----------------------------------------------------------------------
    return (
        CommitteeRole.INFLUENCER,
        0.40,
        f"No rule matched for title '{title}' / department '{department}' / "
        f"seniority '{seniority}' — assigned INFLUENCER (inferred default).",
    )
