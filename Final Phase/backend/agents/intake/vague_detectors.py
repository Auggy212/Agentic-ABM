"""
Pure, stateless vague-value detectors for the Intake Agent.

Each function receives the raw field value and returns either:
  - A clarifying question string  (value is too vague to use downstream)
  - None                          (value is specific enough)

No I/O, no side-effects — every function is independently unit-testable.
"""

from __future__ import annotations

import re
from typing import List, Optional


# ---------------------------------------------------------------------------
# company.*
# ---------------------------------------------------------------------------

def check_value_prop(value: str) -> Optional[str]:
    """Flag value props shorter than 15 words — not enough signal."""
    word_count = len(value.split())
    if word_count < 15:
        return (
            "Your value proposition is too brief for accurate ICP scoring. "
            "Can you expand it? Aim for: what specific problem you solve, "
            "for whom, and how — e.g. 'We help Series B SaaS companies cut "
            "manual prospecting by 80% using real-time buyer-intent signals.'"
        )
    return None


def check_differentiators(values: List[str]) -> Optional[str]:
    """Flag generic differentiators that won't help with positioning."""
    generic = {"easy to use", "easy", "simple", "fast", "best", "affordable",
               "great", "innovative", "scalable", "flexible", "reliable"}
    bland = [v for v in values if v.strip().lower() in generic]
    if len(bland) == len(values) and values:
        return (
            "All listed differentiators are generic. What makes you concretely "
            "different from 6sense, Demandbase, or Clay? E.g. 'real-time job-change "
            "signals', 'native HubSpot two-way sync', '90-day payback guarantee'."
        )
    return None


def check_acv_range(value: str) -> Optional[str]:
    """Flag ACV ranges that are unparseable or impossibly wide."""
    # Detect patterns like "$10k-$500k" or "10000-500000"
    stripped = re.sub(r"[$,kKmM]", "", value).replace("–", "-").replace("—", "-")
    parts = stripped.split("-")
    if len(parts) != 2:
        return (
            "ACV range is not parseable. Please use a format like '$20k–$80k' "
            "or '$20,000–$80,000'."
        )
    try:
        lo_raw, hi_raw = parts[0].strip(), parts[1].strip()
        # Handle k/M suffix that was stripped
        lo = float(lo_raw) if lo_raw else 0
        hi = float(hi_raw) if hi_raw else 0
        if hi / max(lo, 1) > 20:
            return (
                "Your ACV range spans more than 20×. This prevents accurate "
                "account scoring. Can you narrow it to your typical deal size, "
                "e.g. '$30k–$120k'?"
            )
    except (ValueError, ZeroDivisionError):
        return (
            "ACV range is not parseable. Please use a format like '$20k–$80k'."
        )
    return None


# ---------------------------------------------------------------------------
# icp.*
# ---------------------------------------------------------------------------

# Tokens that indicate "everything" rather than a specific sub-vertical
_BROAD_INDUSTRY_TOKENS = {
    "tech", "technology", "software", "it", "saas", "b2b", "enterprise",
    "startup", "startups", "companies", "business", "businesses",
}

def check_icp_industries(values: List[str]) -> Optional[str]:
    """Flag industry lists that are too broad to filter accounts meaningfully."""
    broad = [
        v for v in values
        if v.strip().lower() in _BROAD_INDUSTRY_TOKENS
    ]
    if broad:
        return (
            f"{'|'.join(broad)!r} {'is' if len(broad) == 1 else 'are'} too broad "
            f"to filter accounts. Which sub-verticals? E.g. SaaS → "
            f"'Revenue Intelligence SaaS', 'HR Tech SaaS', 'DevTools'; "
            f"Tech → 'FinTech', 'HealthTech', 'AI/ML'."
        )
    return None


_VAGUE_EMPLOYEE_PATTERNS = re.compile(
    r"^\s*(smb|smbs|mid[-\s]?market|enterprise|large|small|medium|any|all)\s*$",
    re.IGNORECASE,
)
_EMPLOYEE_RANGE_PATTERN = re.compile(r"^\d[\d,]*\s*[-–—]\s*[\d,]+\s*$")

def check_company_size_employees(value: str) -> Optional[str]:
    """Flag non-numeric size descriptors."""
    if _VAGUE_EMPLOYEE_PATTERNS.match(value):
        return (
            f"'{value}' is too vague for account filtering. "
            "What employee range do you mean? E.g. '10–50', '50–200', '200–1,000', '1,000–5,000'."
        )
    if not _EMPLOYEE_RANGE_PATTERN.match(value.replace(",", "")):
        return (
            "Employee range should be numeric, e.g. '50-500'. "
            f"'{value}' won't parse correctly."
        )
    return None


def check_buying_triggers(values: List[str]) -> Optional[str]:
    """Flag empty or singleton trigger lists — they under-specify the signal model."""
    if not values:
        return (
            "No buying triggers defined. What events signal a company is likely "
            "to buy? E.g. 'Series B+ funding', 'hiring VP Sales', 'new CMO hire', "
            "'rebranding', 'expanding to US market'."
        )
    return None


def check_negative_icp(
    values: List[str],
    confirmed_empty: bool,
) -> Optional[str]:
    """
    Flag empty negative_icp UNLESS the caller has explicitly confirmed it is
    intentionally empty via the `negative_icp_confirmed_empty` flag.

    This is the most important detector — a silent empty list poisons the
    account list with competitor accounts and blacklisted domains.
    """
    if not values and not confirmed_empty:
        return (
            "Your exclusion list is empty. Do you have NO accounts to exclude? "
            "If so, type 'NONE' or set negative_icp_confirmed_empty=true. "
            "Otherwise, list competitors, current customers, or domains to skip — "
            "e.g. ['competitor.com', 'gov-only-client.org']. "
            "Skipping this step allows blacklisted accounts into your pipeline."
        )
    return None


# ---------------------------------------------------------------------------
# buyers.*
# ---------------------------------------------------------------------------

_GENERIC_TITLE_TOKENS = {
    "manager", "director", "executive", "leader", "head", "professional",
    "employee", "staff", "person", "user",
}

def check_buyer_titles(values: List[str]) -> Optional[str]:
    """Flag title lists that contain no specific seniority signals."""
    if not values:
        return (
            "No buyer titles defined. Who do you sell to? "
            "E.g. 'VP of Sales', 'Head of Revenue Operations', 'CRO', 'CMO'."
        )
    all_generic = all(
        any(tok in t.lower() for tok in _GENERIC_TITLE_TOKENS) or len(t.split()) < 2
        for t in values
    )
    if all_generic and len(values) <= 2:
        return (
            "Buyer titles look generic. Please be specific — "
            "'Director of Revenue Operations' beats 'Manager'. "
            "What LinkedIn titles does your champion typically hold?"
        )
    return None


def check_pain_points(values: List[str]) -> Optional[str]:
    """Flag pain points that are short enough to be placeholders."""
    if not values:
        return (
            "No pain points defined. What explicit problems does your buyer "
            "articulate? E.g. 'reps spend 60% of time on manual research', "
            "'CRM data is stale within 30 days'."
        )
    suspiciously_short = [v for v in values if len(v.split()) < 3]
    if len(suspiciously_short) == len(values):
        return (
            "Pain points are too short to be useful. "
            "Expand each to a full sentence — include the symptom and its business cost. "
            "E.g. 'Manual prospecting wastes 10+ hrs/week per rep' "
            "rather than 'manual work'."
        )
    return None
