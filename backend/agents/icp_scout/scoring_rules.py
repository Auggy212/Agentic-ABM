"""
Pure, stateless scoring rule functions for the ICP Scout scoring engine.

Each function receives exactly what it needs and returns a float in [0.0, 1.0]
representing the fraction of that dimension's max points earned. The caller
(scoring.py) multiplies the fraction by the dimension's weight to get integer points.

No I/O, no side effects — every function is independently unit-testable.
"""

from __future__ import annotations

import os
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
    "financial services": {"fintech", "insurtech", "wealthtech", "payments", "banking", "lending",
                           "financial technology", "finance"},
    "healthcare": {"healthtech", "medtech", "digital health", "pharma tech", "biotech",
                   "health care", "hospitals and health care", "medical devices"},
    "technology": {"saas", "devtools", "ai/ml", "cybersecurity", "data & analytics", "cloud",
                   "information technology", "information technology and services", "it services",
                   "computer software", "internet", "software", "tech", "computer & network security",
                   "artificial intelligence", "machine learning", "data analytics"},
    "saas": {"revenue intelligence saas", "hr tech saas", "martech saas", "sales tech saas",
             "software as a service", "computer software", "internet", "information technology",
             "information technology and services", "software development", "technology"},
    "hr tech saas": {"human resources", "staffing and recruiting", "hr software",
                     "human resources management", "staffing", "recruiting", "hr tech",
                     "human capital management"},
    "revenue intelligence saas": {"sales intelligence", "business intelligence", "crm",
                                  "computer software", "internet", "information technology",
                                  "sales and marketing", "marketing and advertising"},
    "marketing": {"martech", "adtech", "marketing automation", "account-based marketing",
                  "marketing and advertising", "online media", "advertising services",
                  "public relations", "marketing services"},
    "retail": {"e-commerce", "d2c", "retail tech", "retail", "consumer goods"},
    "real estate": {"proptech", "real estate tech", "real estate"},
    "logistics": {"supply chain tech", "last-mile delivery", "freight tech",
                  "logistics and supply chain", "transportation", "warehousing"},
    "education": {"edtech", "e-learning", "higher ed tech", "education management",
                  "education", "primary/secondary education"},
    "media": {"media tech", "content tech", "streaming", "media production",
              "broadcast media", "online media"},
    "consulting": {"management consulting", "business consulting", "professional services",
                   "strategy and operations", "advisory"},
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
      Within ICP range                 → 1.0
      Within 20% of range (percentage) → 0.5
      'not_found'                      → 0.3  (partial credit — don't penalise missing data)
      Outside range                    → 0.0
    """
    if headcount == "not_found":
        return 0.3

    parsed = _parse_employee_range(icp_size_employees)
    if parsed is None:
        return 0.3

    lo, hi = parsed
    hc = int(headcount)

    if lo <= hc <= hi:
        return 1.0

    # Percentage-based tolerance: at least 10 employees, at most 20% of the range width
    tolerance = max(10, (hi - lo) * 0.20)
    if (lo - tolerance) <= hc < lo or hi < hc <= (hi + tolerance):
        return 0.5

    return 0.0


# ---------------------------------------------------------------------------
# Geography helpers
# ---------------------------------------------------------------------------

_COUNTRY_ALIASES: dict[str, str] = {
    "us": "united states", "usa": "united states", "u.s.": "united states",
    "u.s.a.": "united states", "america": "united states",
    "uk": "united kingdom", "u.k.": "united kingdom", "britain": "united kingdom",
    "great britain": "united kingdom",
    "uae": "united arab emirates",
    "eu": "europe",
    "sg": "singapore",
    "au": "australia",
    "ca": "canada",
    "de": "germany",
    "fr": "france",
    "in": "india",
    "nl": "netherlands",
    "se": "sweden",
    "il": "israel",
}

# Well-known cities that should map to their country (avoids treating city name as country)
_CITY_TO_COUNTRY: dict[str, str] = {
    "new york": "united states", "san francisco": "united states", "los angeles": "united states",
    "chicago": "united states", "austin": "united states", "boston": "united states",
    "seattle": "united states", "denver": "united states", "atlanta": "united states",
    "london": "united kingdom", "manchester": "united kingdom",
    "toronto": "canada", "vancouver": "canada",
    "berlin": "germany", "munich": "germany",
    "paris": "france",
    "amsterdam": "netherlands",
    "stockholm": "sweden",
    "tel aviv": "israel",
    "bangalore": "india", "mumbai": "india", "delhi": "india",
    "sydney": "australia", "melbourne": "australia",
    "singapore": "singapore",
    "dubai": "united arab emirates",
}

# US state abbreviations
_US_STATE_RE = re.compile(r"^[A-Z]{2}$")


def _extract_country(location: str) -> str:
    """
    Best-effort extraction of a country from a free-text location string.
    Returns lowercased canonical country name.

    Handles:
      'San Francisco, CA'             → 'united states'
      'London, UK'                    → 'united kingdom'
      'Toronto, Canada'               → 'canada'
      'Germany'                       → 'germany'
      'Singapore, Singapore'          → 'singapore'
      'San Francisco Bay Area, CA'    → 'united states'
    """
    loc = location.strip()
    if not loc or loc.lower() == "not_found":
        return ""

    parts = [p.strip() for p in loc.split(",")]

    # Ambiguous 2-letter codes that are both ISO country codes and US state abbreviations.
    # When they appear after another location part (city or state), treat as US state.
    _AMBIGUOUS_CODES = {"ca", "in", "de"}

    # Check each part from right to left (country usually last)
    for part in reversed(parts):
        p_lower = part.lower().strip(".")

        # US state abbreviation — checked BEFORE alias for ambiguous codes (e.g. "CA" after
        # a US city means California, not Canada).
        if _US_STATE_RE.match(part.strip()):
            if p_lower in _AMBIGUOUS_CODES and len(parts) > 1:
                return "united states"

        # Direct alias lookup
        if p_lower in _COUNTRY_ALIASES:
            return _COUNTRY_ALIASES[p_lower]

        # Unambiguous US state abbreviation (not a known country code)
        if _US_STATE_RE.match(part.strip()) and p_lower not in _COUNTRY_ALIASES:
            return "united states"

        # Known city → country
        if p_lower in _CITY_TO_COUNTRY:
            return _CITY_TO_COUNTRY[p_lower]

    # Fall back to full string lowercase (handles single-token "Germany", "France" etc.)
    full_lower = loc.lower()
    if full_lower in _COUNTRY_ALIASES:
        return _COUNTRY_ALIASES[full_lower]
    if full_lower in _CITY_TO_COUNTRY:
        return _CITY_TO_COUNTRY[full_lower]

    # Last part as-is
    last = parts[-1].lower().strip(".")
    return _COUNTRY_ALIASES.get(last, last)


def score_geography(account_hq: str, icp_geographies: List[str]) -> float:
    """
    Returns fraction of geography weight earned.
      HQ location matches an ICP geography entry (city or country) → 1.0
      Same country, different city                                  → 0.5
      Different country                                             → 0.0
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
            geo_is_country_level = "," not in geo.strip()
            if geo_is_country_level:
                return 1.0
            return 0.5

    return 0.0


# ---------------------------------------------------------------------------
# Tech stack helpers
# ---------------------------------------------------------------------------

def _tech_words(tech: str) -> set[str]:
    """Split a tech name into word tokens, normalising hyphens and underscores."""
    return set(re.split(r"[\s\-_/]+", tech.strip().lower()))


def score_tech_stack(
    account_technologies: List[str],
    icp_tech_signals: List[str],
) -> float:
    """
    Returns fraction of tech_stack weight earned.
      = (# ICP signals present in account) / (# ICP signals defined)

    Matching requires ALL words in the signal to appear in the tech name
    (word-boundary level, not arbitrary substring). This prevents "hr" matching
    "sharepoint" while still matching "hubspot" → "hubspot crm".

    If no ICP signals defined → 0.0.
    If account has no tech data → 0.2 (data missing, not disqualifying).
    """
    if not icp_tech_signals:
        return 0.0

    if not account_technologies:
        return 0.2

    account_word_sets = [_tech_words(t) for t in account_technologies]
    matches = 0
    for signal in icp_tech_signals:
        sig_words = _tech_words(signal)
        # A signal matches if all its words appear in at least one account tech's word set
        if any(sig_words <= acc_words or acc_words <= sig_words for acc_words in account_word_sets):
            matches += 1
        # Fallback: full lowercased signal substring in any full lowercased tech name
        elif any(signal.strip().lower() in t.strip().lower() for t in account_technologies):
            matches += 1
    return matches / len(icp_tech_signals)


# ---------------------------------------------------------------------------
# Funding stage helpers
# ---------------------------------------------------------------------------

_STAGE_ORDER: list[str] = [
    "pre-seed",
    "seed",
    "series a",
    "series b",
    "series c",
    "series d",
    "growth",
    "series e",
    "series f",
    "late stage",
    "ipo",
    "public",
    "enterprise",
]

def _normalise_stage(stage: str) -> str:
    return stage.strip().lower().replace("_", " ")


def _stage_index(stage: str) -> int | None:
    n = _normalise_stage(stage)
    for i, s in enumerate(_STAGE_ORDER):
        if n == s:
            return i
    # Only allow prefix match when one is a strict prefix of the other AND they
    # differ by at least one character — prevents "seed" matching "pre-seed".
    for i, s in enumerate(_STAGE_ORDER):
        if n != s and (s.startswith(n + " ") or n.startswith(s + " ")):
            return i
    return None


def score_funding_stage(account_stage: str, icp_stages: List[str]) -> float:
    """
    Returns fraction of funding_stage weight earned.
      Exact match (case-insensitive)  → 1.0
      Adjacent stage (distance = 1)   → 0.5
      not_found / unknown             → 0.3
      Otherwise                       → 0.0
    """
    if not account_stage or account_stage.strip().lower() in ("not_found", "unknown", ""):
        return 0.3

    account_n = _normalise_stage(account_stage)
    icp_normalised = [_normalise_stage(s) for s in icp_stages]

    if account_n in icp_normalised:
        return 1.0

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

# Configurable via env var; default 90 days suits mid-market sales cycles.
_TRIGGER_WINDOW_DAYS: int = int(os.environ.get("BUYING_TRIGGER_WINDOW_DAYS", "90"))


def score_buying_triggers(
    recent_signals: list,
    icp_buying_triggers: List[str],
    reference_date: date | None = None,
) -> float:
    """
    Returns a fractional score based on how many ICP buying triggers are matched
    by recent signals within the configured window (default 90 days).

    Score = (# distinct triggers matched) / (# triggers defined), capped at 1.0.
    This rewards accounts with multiple matching signals over single-signal matches.

    Matching is word-level: every significant word (>2 chars) in the trigger must
    appear in the signal text. This avoids false matches from short substring overlaps.

    reference_date defaults to today — injectable for deterministic testing.
    """
    if not icp_buying_triggers or not recent_signals:
        return 0.0

    cutoff = (reference_date or date.today()) - timedelta(days=_TRIGGER_WINDOW_DAYS)
    triggers_lower = [t.strip().lower() for t in icp_buying_triggers]

    matched_triggers: set[str] = set()

    for signal in recent_signals:
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
            continue

        if hasattr(signal, "signal_type"):
            sig_text = f"{signal.signal_type} {signal.description}".lower()
        elif isinstance(signal, dict):
            sig_text = f"{signal.get('type', '')} {signal.get('description', '')}".lower()
        else:
            continue

        sig_words = set(re.split(r"\W+", sig_text))

        for trigger in triggers_lower:
            if trigger in matched_triggers:
                continue
            # Full phrase match
            if trigger in sig_text:
                matched_triggers.add(trigger)
                continue
            # Word-level match: every significant trigger word must appear in signal words
            trigger_words = [w for w in re.split(r"\W+", trigger) if len(w) > 2]
            if trigger_words and all(
                any(tw == sw or sw[:3] == tw[:3] for sw in sig_words if len(sw) >= 3)
                for tw in trigger_words
            ):
                matched_triggers.add(trigger)

    if not matched_triggers:
        return 0.0
    return min(1.0, len(matched_triggers) / len(icp_buying_triggers))
