"""
Pure, stateless scoring rule functions for the ICP Scout scoring engine.

Each function receives exactly what it needs and returns a float in [0.0, 1.0]
representing the fraction of that dimension's max points earned. The caller
(scoring.py) multiplies the fraction by the dimension's weight to get integer points.

No I/O, no side effects — every function is independently unit-testable.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import List, Union

# ---------------------------------------------------------------------------
# Industry helpers
# ---------------------------------------------------------------------------

# Coarse parent-category mapping: canonical parent → set of child labels.
# "60% credit" applies when account.industry matches a parent of an ICP industry
# OR an ICP industry is a parent of account.industry.
# Values are lowercased for case-insensitive matching.
_PARENT_CATEGORIES: dict[str, set[str]] = {
    "financial services": {"fintech", "insurtech", "wealthtech", "payments", "banking", "lending"},
    "healthcare": {"healthtech", "medtech", "digital health", "pharma tech", "biotech"},
    "technology": {"saas", "devtools", "ai/ml", "cybersecurity", "data & analytics", "cloud"},
    "saas": {"revenue intelligence saas", "hr tech saas", "martech saas", "sales tech saas"},
    "marketing": {"martech", "adtech", "marketing automation", "account-based marketing"},
    "retail": {"e-commerce", "d2c", "retail tech"},
    "real estate": {"proptech", "real estate tech"},
    "logistics": {"supply chain tech", "last-mile delivery", "freight tech"},
    "education": {"edtech", "e-learning", "higher ed tech"},
    "media": {"media tech", "content tech", "streaming"},
}

def _industry_lower(s: str) -> str:
    return s.strip().lower()


def _are_parent_child(a: str, b: str) -> bool:
    """Return True if a and b share a parent-child relationship in _PARENT_CATEGORIES."""
    al, bl = _industry_lower(a), _industry_lower(b)
    for parent, children in _PARENT_CATEGORIES.items():
        members = children | {parent}
        if al in members and bl in members:
            return True
    return False


def score_industry(account_industry: str, icp_industries: List[str]) -> float:
    """
    Returns fraction of industry weight earned.
      Exact match (case-insensitive)  → 1.0
      Parent/child category match     → 0.6
      No match                        → 0.0
    """
    al = _industry_lower(account_industry)
    icp_lower = [_industry_lower(i) for i in icp_industries]

    if al in icp_lower:
        return 1.0

    for icp_ind in icp_industries:
        if _are_parent_child(account_industry, icp_ind):
            return 0.6

    return 0.0


# ---------------------------------------------------------------------------
# Company size helpers
# ---------------------------------------------------------------------------

_SIZE_RANGE_RE = re.compile(r"(\d[\d,]*)\s*[-–—]\s*(\d[\d,]*)")

def _parse_employee_range(range_str: str) -> tuple[int, int] | None:
    """Parse '50-500' or '1,000-5,000' into (lo, hi). Returns None on failure."""
    m = _SIZE_RANGE_RE.search(range_str.replace(",", ""))
    if not m:
        return None
    try:
        return int(m.group(1)), int(m.group(2))
    except ValueError:
        return None


def score_company_size(
    headcount: Union[int, str],
    icp_size_employees: str,
) -> float:
    """
    Returns fraction of company_size weight earned.
      Within ICP range           → 1.0
      Within 20% of range edges  → 0.5
      'not_found'                → 0.3   (partial credit — don't penalise missing data)
      Outside range              → 0.0
    """
    if headcount == "not_found":
        return 0.3

    parsed = _parse_employee_range(icp_size_employees)
    if parsed is None:
        # Range unparseable — give partial credit rather than zero
        return 0.3

    lo, hi = parsed
    hc = int(headcount)

    if lo <= hc <= hi:
        return 1.0

    # 20% tolerance band
    tolerance = (hi - lo) * 0.20
    near_lo = lo - tolerance
    near_hi = hi + tolerance

    if near_lo <= hc < lo or hi < hc <= near_hi:
        return 0.5

    return 0.0


# ---------------------------------------------------------------------------
# Geography helpers
# ---------------------------------------------------------------------------

# Minimal country normalisation: map common aliases and city+country strings
# down to a canonical country code or lowercase country name.
_COUNTRY_ALIASES: dict[str, str] = {
    "us": "united states", "usa": "united states", "u.s.": "united states",
    "u.s.a.": "united states", "america": "united states",
    "uk": "united kingdom", "u.k.": "united kingdom", "britain": "united kingdom",
    "great britain": "united kingdom",
    "uae": "united arab emirates",
    "eu": "europe",  # kept as-is for region-level matching
}

def _extract_country(location: str) -> str:
    """
    Best-effort extraction of a country from a free-text location string.
    Returns lowercased canonical country name.

    Examples:
      'San Francisco, CA' → 'united states'  (CA treated as US state)
      'London, UK'        → 'united kingdom'
      'Toronto, Canada'   → 'canada'
      'Germany'           → 'germany'
    """
    loc = location.strip()
    # If last token after the final comma is a 2-letter string, treat as state/country code
    parts = [p.strip() for p in loc.split(",")]
    # Try last segment first (usually country or state abbreviation)
    for part in reversed(parts):
        p_lower = part.lower().strip(".")
        if p_lower in _COUNTRY_ALIASES:
            return _COUNTRY_ALIASES[p_lower]
        # US state abbreviations: 2 uppercase letters
        if re.match(r"^[A-Z]{2}$", part.strip()):
            return "united states"
        # Longer segment — could be a full country name
        if len(part.split()) >= 1 and part.lower() not in {"city", "district", "province"}:
            resolved = _COUNTRY_ALIASES.get(p_lower, p_lower)
            if resolved != p_lower or len(parts) == 1:
                return resolved

    return loc.lower()


def score_geography(account_hq: str, icp_geographies: List[str]) -> float:
    """
    Returns fraction of geography weight earned.
      HQ location matches an ICP geography entry (city or country) → 1.0
      Same country, different city                                  → 0.5
      Different country                                             → 0.0

    ICP geography entries can be city names, country names, or country codes.
    Matching is case-insensitive.
    """
    account_lower = account_hq.strip().lower()
    account_country = _extract_country(account_hq)

    for geo in icp_geographies:
        geo_lower = geo.strip().lower()
        geo_country = _extract_country(geo)

        # Exact string match
        if account_lower == geo_lower:
            return 1.0

        # Account location contains the ICP entry verbatim
        if geo_lower in account_lower:
            return 1.0

        # Same country after normalisation
        if account_country and geo_country and account_country == geo_country:
            # ICP entry is country-level when it has no comma (not a "City, Country" string)
            geo_is_country_level = "," not in geo.strip()
            if geo_is_country_level:
                return 1.0
            # Both city-level, same country → partial credit
            return 0.5

    return 0.0


# ---------------------------------------------------------------------------
# Tech stack helpers
# ---------------------------------------------------------------------------

def score_tech_stack(
    account_technologies: List[str],
    icp_tech_signals: List[str],
) -> float:
    """
    Returns fraction of tech_stack weight earned.
      = (# ICP signals present in account) / (# ICP signals defined)
      Case-insensitive substring match.
      If no ICP signals are defined, return 0.0 (no signal = no score).
    """
    if not icp_tech_signals:
        return 0.0

    account_lower = {t.strip().lower() for t in account_technologies}
    matches = sum(
        1 for signal in icp_tech_signals
        if signal.strip().lower() in account_lower
    )
    return matches / len(icp_tech_signals)


# ---------------------------------------------------------------------------
# Funding stage helpers
# ---------------------------------------------------------------------------

# Ordered stages — adjacency is defined by distance of 1 in this sequence
_STAGE_ORDER: list[str] = [
    "pre-seed",
    "seed",
    "series a",
    "series b",
    "series c",
    "series d",
    "growth",
    "late stage",
    "ipo",
    "public",
    "enterprise",
]

def _normalise_stage(stage: str) -> str:
    return stage.strip().lower().replace("_", " ").replace("-", " ")


def _stage_index(stage: str) -> int | None:
    n = _normalise_stage(stage)
    # Exact match first
    for i, s in enumerate(_STAGE_ORDER):
        if n == s:
            return i
    # Fallback: one contains the other, but guard against "seed" ⊂ "pre-seed"
    for i, s in enumerate(_STAGE_ORDER):
        if n in s or s in n:
            # Avoid false matches like "seed" inside "pre-seed"
            if n != s and (s.startswith(n) or n.startswith(s)):
                return i
    return None


def score_funding_stage(account_stage: str, icp_stages: List[str]) -> float:
    """
    Returns fraction of funding_stage weight earned.
      Exact match (case-insensitive)  → 1.0
      Adjacent stage (distance = 1)   → 0.5
      Otherwise                       → 0.0
    """
    account_n = _normalise_stage(account_stage)
    icp_normalised = [_normalise_stage(s) for s in icp_stages]

    # Exact
    if account_n in icp_normalised:
        return 1.0

    # Adjacent
    account_idx = _stage_index(account_stage)
    if account_idx is not None:
        for icp_stage in icp_stages:
            icp_idx = _stage_index(icp_stage)
            if icp_idx is not None and abs(account_idx - icp_idx) == 1:
                return 0.5

    return 0.0


# ---------------------------------------------------------------------------
# Buying trigger helpers
# ---------------------------------------------------------------------------

_TRIGGER_WINDOW_DAYS = 90


def score_buying_triggers(
    recent_signals: list,  # List of Signal-like objects with signal_type, description, signal_date
    icp_buying_triggers: List[str],
    reference_date: date | None = None,
) -> float:
    """
    Returns 1.0 if ANY ICP buying trigger matches a recent signal within the
    last 90 days. Returns 0.0 otherwise.

    Matching is case-insensitive substring: a signal matches a trigger if
    the trigger text appears in the signal's type OR description.

    reference_date defaults to today — injectable for deterministic testing.
    """
    if not icp_buying_triggers or not recent_signals:
        return 0.0

    cutoff = (reference_date or date.today()) - timedelta(days=_TRIGGER_WINDOW_DAYS)
    triggers_lower = [t.strip().lower() for t in icp_buying_triggers]

    for signal in recent_signals:
        # Support both Pydantic Signal objects (with aliases) and plain dicts
        if hasattr(signal, "signal_date"):
            sig_date = signal.signal_date
        elif isinstance(signal, dict):
            raw = signal.get("date") or signal.get("signal_date")
            sig_date = date.fromisoformat(raw) if isinstance(raw, str) else raw
        else:
            continue

        if isinstance(sig_date, str):
            try:
                sig_date = date.fromisoformat(sig_date)
            except ValueError:
                continue

        if sig_date < cutoff:
            continue  # outside window

        # Build text to match against
        if hasattr(signal, "signal_type"):
            sig_text = f"{signal.signal_type} {signal.description}".lower()
        elif isinstance(signal, dict):
            sig_text = f"{signal.get('type', '')} {signal.get('description', '')}".lower()
        else:
            continue

        for trigger in triggers_lower:
            # Full phrase match (fastest path)
            if trigger in sig_text:
                return 1.0
            # Stem match: every significant trigger word (>3 chars) must have
            # a common prefix of >= 4 chars with some word in the signal text,
            # OR appear as a substring/superset of a signal word.
            # Handles "hire"↔"hiring" (share "hir" — wait, we need ≥4, but
            # "hire" and "hiring" share only 3 letters before diverging).
            # Use ≥3 common prefix for short stems (4-5 char trigger words).
            trigger_words = [w for w in trigger.split() if len(w) > 3]
            if not trigger_words:
                continue
            sig_words = sig_text.split()
            def _common_prefix_len(a: str, b: str) -> int:
                n = min(len(a), len(b))
                for i in range(n):
                    if a[i] != b[i]:
                        return i
                return n

            def _word_present(tw: str) -> bool:
                # substring match
                if tw in sig_text:
                    return True
                min_stem = 3 if len(tw) <= 5 else 4
                for sw in sig_words:
                    if _common_prefix_len(tw, sw) >= min_stem:
                        return True
                    if tw in sw or sw in tw:
                        return True
                return False

            if all(_word_present(tw) for tw in trigger_words):
                return 1.0

    return 0.0
