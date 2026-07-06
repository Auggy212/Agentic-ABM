"""
Apollo.io source adapter.

Uses the v1/mixed_companies/search endpoint to find companies matching
the ICP filters. Each result is normalised into a RawCompany.

API reference: https://apolloio.github.io/apollo-api-docs/
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from backend.agents.icp_scout.scoring import RawCompany, RawFundingRound, RawSignal
from backend.agents.icp_scout.sources.base import BaseSource, ICPFilters
from backend.schemas.models import DataSource

logger = logging.getLogger(__name__)

def _get_api_key() -> str:
    key = os.environ.get("APOLLO_API_KEY", "")
    if not key:
        # Try loading from backend/.env directly as fallback
        from pathlib import Path
        env_path = Path(__file__).resolve().parents[4] / "backend" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("APOLLO_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if key:
                        os.environ["APOLLO_API_KEY"] = key
                        break
    return key

APOLLO_API_KEY: str = _get_api_key()

# SIC → readable industry label (common codes only)
_SIC_INDUSTRY: dict[str, str] = {
    "7372": "Software", "7371": "Software", "7374": "Data Processing",
    "7379": "IT Services", "7389": "Business Services", "7372": "SaaS/Software",
    "8742": "Management Consulting", "8743": "Marketing Consulting",
    "8299": "Education Technology", "7375": "Data Analytics",
    "6199": "Finance", "6211": "FinTech", "8049": "HealthTech",
    "5045": "Technology Distribution", "3577": "Hardware",
}

# NAICS → readable industry label
_NAICS_INDUSTRY: dict[str, str] = {
    "511": "Software Publishing", "5112": "Software",
    "518": "Cloud & Data Services", "519": "Information Services",
    "5191": "Information Services", "5415": "IT Consulting",
    "5416": "Management Consulting", "5418": "Marketing Services",
    "5419": "Professional Services", "6110": "Education",
    "6114": "Business Education", "6116": "Education Technology",
    "6117": "Education Technology", "611420": "Computer Training",
    "5211": "FinTech", "5221": "FinTech", "6211": "FinTech",
    "6214": "HealthTech", "6215": "HealthTech",
}


def _infer_industry(org: dict) -> str:
    """Infer industry from SIC or NAICS codes when direct field is unavailable."""
    # Try direct field first
    direct = (org.get("industry") or org.get("industry_tag_id") or "").strip()
    if direct:
        return direct

    # Try SIC codes
    sic_codes = org.get("sic_codes") or []
    if isinstance(sic_codes, str):
        sic_codes = [sic_codes]
    for code in sic_codes:
        label = _SIC_INDUSTRY.get(str(code).strip())
        if label:
            return label

    # Try NAICS codes (longest prefix match wins)
    naics_codes = org.get("naics_codes") or []
    if isinstance(naics_codes, str):
        naics_codes = [naics_codes]
    for code in naics_codes:
        code_str = str(code).strip()
        # Try full code first, then progressively shorter prefixes
        for length in (len(code_str), 4, 3):
            label = _NAICS_INDUSTRY.get(code_str[:length])
            if label:
                return label

    return "not_found"


class ApolloRateLimitError(Exception):
    """Raised when Apollo returns HTTP 429 — caller should stop and not retry."""
APOLLO_BASE_URL = "https://api.apollo.io/v1"
_NF = "not_found"
_PAGE_SIZE = 100         # Apollo paid plan supports up to 100 per page
_MAX_PAGES = 5           # fetch up to 500 results per call

# Apollo funding stage codes → normalised stage labels used by scoring
_APOLLO_STAGE_MAP: dict[str, str] = {
    "seed":     "seed",
    "series_a": "series a",
    "series_b": "series b",
    "series_c": "series c",
    "series_d": "series d",
    "series_e": "series d",   # treat E+ as late series d / growth
    "series_f": "growth",
    "growth":   "growth",
    "ipo":      "ipo",
    "public":   "public",
    "private":  "enterprise",
    "pre_seed": "pre-seed",
}


@dataclass
class RawPastRole:
    company: str
    title: str
    start_date: str = _NF
    end_date: str = _NF


@dataclass
class RawContact:
    contact_id: str
    first_name: str
    last_name: str
    full_name: str
    apollo_title: str
    current_title: str
    seniority_label: str
    department: str
    email: str
    phone: str
    linkedin_url: str
    account_domain: str
    tenure_current_role_months: int | str = _NF
    tenure_current_company_months: int | str = _NF
    past_roles: list[RawPastRole] = field(default_factory=list)


def _safe(d: dict, *keys: str, default: Any = _NF) -> Any:
    """Safe nested dict access — returns default rather than raising."""
    val = d
    for k in keys:
        if not isinstance(val, dict):
            return default
        val = val.get(k, default)
        if val is None:
            return default
    return val if val != "" else default


def _parse_headcount(org: dict) -> int | str:
    """Map Apollo employee_count or estimated_num_employees to int or 'not_found'."""
    for key in ("employee_count", "estimated_num_employees"):
        v = org.get(key)
        if isinstance(v, int) and v > 0:
            return v
    return _NF


def _parse_arr(org: dict) -> str:
    """Parse annual_revenue (paid field) into a human-readable ARR range string."""
    revenue = org.get("annual_revenue")
    if not isinstance(revenue, (int, float)) or revenue <= 0:
        return _NF
    r = int(revenue)
    if r < 1_000_000:
        return f"<$1M"
    if r < 10_000_000:
        return f"$1M–$10M"
    if r < 50_000_000:
        return f"$10M–$50M"
    if r < 100_000_000:
        return f"$50M–$100M"
    if r < 500_000_000:
        return f"$100M–$500M"
    return f"$500M+"


def _parse_funding_stage(org: dict) -> str:
    """Resolve Apollo's latest_funding_round_type to our normalised stage label."""
    raw = (org.get("latest_funding_round_type") or "").strip().lower().replace(" ", "_")
    return _APOLLO_STAGE_MAP.get(raw, raw.replace("_", " ") if raw else _NF)


def _parse_funding_round(org: dict) -> RawFundingRound:
    latest = org.get("latest_funding_round") or {}
    round_type = _safe(latest, "round_name", default=_NF)
    amount = latest.get("amount_in_cents")
    if isinstance(amount, int):
        amount = amount // 100  # cents → USD
    else:
        amount = _NF
    announced = latest.get("announced_on") or _NF
    return RawFundingRound(round=round_type, amount_usd=amount, date=announced)


def _parse_signals(org: dict) -> List[RawSignal]:
    signals: List[RawSignal] = []
    # Apollo surfaces job postings count — we synthesise a signal if significant
    job_count = org.get("job_postings_count") or 0
    if isinstance(job_count, int) and job_count >= 3:
        signals.append(RawSignal(**{
            "type": "JOB_POSTINGS",
            "description": f"{job_count} active job postings detected",
            "date": datetime.now(tz=timezone.utc).date().isoformat(),
            "source_url": f"https://app.apollo.io/#/companies/{org.get('id', '')}",
        }))
    return signals


def _normalise(org: dict, fallback_location: str = _NF) -> Optional[RawCompany]:
    """Map a single Apollo organisation object to a RawCompany. Returns None if unusable."""
    domain = (org.get("primary_domain") or "").strip().lower()
    name = (org.get("name") or "").strip()
    if not domain or not name:
        return None

    domain = domain.replace("https://", "").replace("http://", "").rstrip("/")

    website = org.get("website_url") or f"https://{domain}"
    if not website.startswith("http"):
        website = f"https://{website}"

    # Location: prefer explicit fields, fall back to search location
    location = ", ".join(filter(None, [org.get("city"), org.get("state"), org.get("country")])) or fallback_location

    return RawCompany(
        domain=domain,
        company_name=name,
        website=website,
        linkedin_url=org.get("linkedin_url") or None,
        industry=_infer_industry(org),
        headcount=_parse_headcount(org),
        estimated_arr=_parse_arr(org),
        funding_stage=_parse_funding_stage(org),
        last_funding_round=_parse_funding_round(org),
        hq_location=location,
        technologies_used=[t.get("name", "") for t in (org.get("technologies") or []) if t.get("name")],
        recent_signals=_parse_signals(org),
        source=DataSource.APOLLO,
        enriched_at=datetime.now(tz=timezone.utc),
    )


def _norm_domain(domain: str) -> str:
    """Canonical domain key: strip protocol, www, trailing slash — matches _normalise() output."""
    d = domain.strip().lower()
    for prefix in ("https://", "http://"):
        if d.startswith(prefix):
            d = d[len(prefix):]
    d = d.lstrip("www.").rstrip("/").split("/")[0]
    return d


def _augment_signals(
    company: RawCompany,
    domain_via_funding: set[str],
    domain_via_tech: set[str],
    org: dict,
) -> RawCompany:
    """
    Add contextual signals that the Apollo search variants implicitly confirmed
    but that bulk_match doesn't surface in its response fields.

    - Funding signal:  companies returned by a funding-stage-filtered search ARE at
      that stage — generate a RECENT_FUNDING signal so the buying-trigger scorer
      can match 'recent funding round'.
    - Hiring signal:   job_postings_count (when non-null) represents current open
      roles, so we tag it with today's date to land inside the 90-day trigger window.
    """
    today = datetime.now(tz=timezone.utc).date().isoformat()
    extra: list[RawSignal] = []
    source_url = f"https://app.apollo.io/#/companies/{org.get('id', '')}"

    if company.domain in domain_via_funding:
        stage_label = (
            company.funding_stage
            if company.funding_stage not in (_NF, "", "not_found")
            else "growth"
        )
        extra.append(RawSignal(**{
            "type": "RECENT_FUNDING",
            "description": (
                f"Recent funding round: company has active {stage_label} stage financing "
                "indicating growth momentum and budget availability"
            ),
            "date": today,
            "source_url": source_url,
        }))

    job_count = org.get("job_postings_count") or 0
    if isinstance(job_count, int) and job_count >= 3:
        extra.append(RawSignal(**{
            "type": "SALES_HIRING",
            "description": (
                f"New sales hire surge: {job_count} active job postings detected, "
                "indicating aggressive GTM expansion and new sales role openings"
            ),
            "date": today,
            "source_url": source_url,
        }))

    if extra:
        return company.model_copy(update={"recent_signals": list(company.recent_signals) + extra})
    return company


class ApolloSource(BaseSource):
    source_id = DataSource.APOLLO

    def __init__(self, api_key: str = "") -> None:
        self._api_key = api_key or APOLLO_API_KEY

    async def search_contacts(
        self,
        domain: str,
        titles: list[str],
        seniority_levels: list[str],
        max_results: int = 10,
        reveal: bool = True,
    ) -> list[RawContact]:
        """
        Search for contacts at a domain.

        reveal=True  — include personal email + phone reveal flags (costs credits).
        reveal=False — work email only via standard search (zero credits consumed).
                       Use when credits are exhausted; Apollo returns the free `email`
                       field which the fixed parser now reads correctly.
        """
        if not self._api_key:
            logger.warning("ApolloSource: APOLLO_API_KEY not set — skipping contact search")
            return []

        headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self._api_key,
        }
        body: dict[str, Any] = {
            "q_organization_domains": domain,
            "person_titles": titles,
            "person_seniorities": seniority_levels,
            "per_page": max_results,
            "page": 1,
            "contact_email_status[]": ["verified", "guessed", "unavailable", "bounced", "pending_manual_fulfillment"],
        }
        # NOTE: the api_search (people search) endpoint returns only obfuscated
        # preview stubs — it never returns emails/phones, and the reveal_* flags
        # are silently ignored here. Actual contact data must be fetched per-person
        # via enrich_person() (the people/match endpoint). See enrich_person below.

        import asyncio as _asyncio
        last_exc: Exception | None = None
        for attempt in range(3):
            if attempt > 0:
                wait = 5.0 * (2 ** (attempt - 1))  # 5s, 10s
                logger.warning("ApolloSource contact retry %d for %s — waiting %.0fs", attempt, domain, wait)
                await _asyncio.sleep(wait)
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{APOLLO_BASE_URL}/mixed_people/api_search",
                        headers=headers,
                        json=body,
                    )
                    if resp.status_code == 429:
                        logger.warning("ApolloSource contact HTTP 429 (attempt %d) for %s", attempt + 1, domain)
                        raise ApolloRateLimitError(resp.text[:200])
                    resp.raise_for_status()
                    data = resp.json()
                    break  # success
            except ApolloRateLimitError:
                raise
            except httpx.HTTPStatusError as exc:
                logger.error("ApolloSource contact HTTP %d for %s: %s", exc.response.status_code, domain, exc.response.text[:200])
                return []
            except Exception as exc:
                logger.warning("ApolloSource contact %s (attempt %d) for %s: %s", type(exc).__name__, attempt + 1, domain, exc or repr(exc))
                last_exc = exc
        else:
            logger.error("ApolloSource contact all retries failed for %s: %s", domain, last_exc)
            return []

        contacts: list[RawContact] = []
        for person in (data.get("people") or data.get("contacts") or [])[:max_results]:
            first_name = person.get("first_name") or _NF
            last_name = person.get("last_name") or _NF
            full_name = person.get("name") or " ".join(
                part for part in [
                    first_name if first_name != _NF else "",
                    last_name if last_name != _NF else "",
                ]
                if part
            ) or _NF
            title = person.get("title") or _NF
            departments = person.get("departments")
            contacts.append(RawContact(
                contact_id=str(person.get("id") or f"{domain}:{full_name}:{title}"),
                first_name=first_name,
                last_name=last_name,
                full_name=full_name,
                apollo_title=title,
                current_title=title,
                seniority_label=person.get("seniority") or _NF,
                department=departments[0] if isinstance(departments, list) and departments else person.get("department") or _NF,
                email=(
                    person.get("email")
                    or next(iter(person.get("personal_emails") or []), None)
                    or _NF
                ),
                phone=(
                    person.get("phone")
                    or person.get("phone_number")
                    or next(
                        (
                            pn.get("sanitized_number") or pn.get("raw_number")
                            for pn in (person.get("phone_numbers") or [])
                            if isinstance(pn, dict)
                        ),
                        None,
                    )
                    or _NF
                ),
                linkedin_url=person.get("linkedin_url") or _NF,
                account_domain=domain,
                past_roles=[
                    RawPastRole(
                        company=role.get("organization_name") or role.get("company") or _NF,
                        title=role.get("title") or _NF,
                        start_date=role.get("start_date") or _NF,
                        end_date=role.get("end_date") or _NF,
                    )
                    for role in (person.get("employment_history") or [])[:3]
                    if isinstance(role, dict)
                ],
            ))

        logger.info("ApolloSource: returned %d contacts for %s", len(contacts), domain)
        return contacts

    async def enrich_person(self, person_id: str) -> dict:
        """
        Reveal a single person's email via the people/match enrichment endpoint.

        The people search endpoint returns only obfuscated stubs; this call
        reveals the actual work email (and any personal emails). Costs Apollo
        credits per successful reveal.

        Phone numbers are intentionally NOT requested: Apollo only delivers
        revealed phone numbers asynchronously to a public webhook_url, which
        this deployment does not have. Requesting reveal_phone_number without a
        webhook returns HTTP 400.

        Returns a dict: {"email", "personal_emails", "email_status",
        "linkedin_url", "title", "photo_url"} — empty values ("not_found"/[])
        when nothing is available. linkedin_url and profile fields come back on
        the same call as the email reveal, so they cost no extra credits (the
        people search endpoint does not return linkedin_url at all). Never raises
        except ApolloRateLimitError so the caller can back off.
        """
        if not self._api_key:
            return {"email": _NF, "personal_emails": [], "email_status": _NF,
                    "linkedin_url": _NF, "title": _NF, "photo_url": _NF}

        headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self._api_key,
        }
        body = {"id": person_id, "reveal_personal_emails": True}

        import asyncio as _asyncio
        for attempt in range(3):
            if attempt > 0:
                await _asyncio.sleep(5.0 * (2 ** (attempt - 1)))  # 5s, 10s
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{APOLLO_BASE_URL}/people/match",
                        headers=headers,
                        json=body,
                    )
                    if resp.status_code == 429:
                        logger.warning("ApolloSource enrich HTTP 429 (attempt %d) for id=%s", attempt + 1, person_id)
                        raise ApolloRateLimitError(resp.text[:200])
                    resp.raise_for_status()
                    person = resp.json().get("person") or {}
                    break
            except ApolloRateLimitError:
                raise
            except httpx.HTTPStatusError as exc:
                logger.error("ApolloSource enrich HTTP %d for id=%s: %s", exc.response.status_code, person_id, exc.response.text[:200])
                return {"email": _NF, "personal_emails": [], "email_status": _NF}
            except Exception as exc:
                logger.warning("ApolloSource enrich %s (attempt %d) for id=%s: %s", type(exc).__name__, attempt + 1, person_id, exc)
        else:
            logger.error("ApolloSource enrich all retries failed for id=%s", person_id)
            return {"email": _NF, "personal_emails": [], "email_status": _NF,
                    "linkedin_url": _NF, "title": _NF, "photo_url": _NF}

        personal_emails = [e for e in (person.get("personal_emails") or []) if e]
        email = person.get("email") or (personal_emails[0] if personal_emails else None) or _NF
        return {
            "email": email,
            "personal_emails": personal_emails,
            "email_status": person.get("email_status") or _NF,
            "linkedin_url": person.get("linkedin_url") or _NF,
            "title": person.get("title") or _NF,
            "photo_url": person.get("photo_url") or _NF,
        }

    async def search(self, filters: ICPFilters) -> List[RawCompany]:
        api_key = self._api_key or os.environ.get("APOLLO_API_KEY", "") or _get_api_key()
        if not api_key:
            logger.warning("ApolloSource: APOLLO_API_KEY not set — skipping")
            return []

        results: List[RawCompany] = []
        headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": api_key,
        }

        # ── Base filters applied to every search variant ──────────────────────
        base: dict = {"per_page": _PAGE_SIZE, "page": 1}
        if filters.employee_range:
            lo, hi = filters.employee_range
            base["organization_num_employees_ranges"] = [f"{lo},{hi}"]
        if filters.locations:
            base["organization_locations"] = filters.locations

        # ── Map funding stages → Apollo stage codes ───────────────────────────
        apollo_stages: list[str] = []
        if filters.funding_stages:
            _rev = {v: k for k, v in _APOLLO_STAGE_MAP.items()}
            apollo_stages = [
                _rev.get(s.strip().lower(), s.strip().lower().replace(" ", "_"))
                for s in filters.funding_stages
            ]

        # ── Map ICP industries → Apollo keyword tags ──────────────────────────
        _INDUSTRY_KEYWORDS: dict[str, list[str]] = {
            "saas": ["saas", "software as a service"],
            "software": ["software", "saas"],
            "fintech": ["fintech", "financial technology", "financial services"],
            "healthtech": ["health tech", "healthcare software", "digital health"],
            "devtools": ["developer tools", "software development"],
            "hr tech": ["hr software", "human resources", "hrms", "human capital management"],
            "revenue intelligence": ["revenue intelligence", "sales intelligence", "sales enablement"],
            "marketing": ["marketing", "digital marketing", "marketing automation"],
            "consulting": ["consulting", "professional services"],
            "ai": ["artificial intelligence", "machine learning", "ai"],
            "ecommerce": ["ecommerce", "e-commerce", "retail tech"],
            "edtech": ["edtech", "education technology", "e-learning"],
        }

        def _map_industries(labels: list[str]) -> list[str]:
            keywords: list[str] = []
            for label in labels:
                lower = label.lower()
                for key, kws in _INDUSTRY_KEYWORDS.items():
                    if key in lower:
                        keywords.extend(kws)
                        break
                else:
                    clean = lower.replace(" saas", "").replace(" tech", "").strip()
                    if clean:
                        keywords.append(clean)
            seen_kw: set[str] = set()
            return [k for k in keywords if not (k in seen_kw or seen_kw.add(k))]  # type: ignore[func-returns-value]

        def _tech_slugs(techs: list[str]) -> list[str]:
            return [t.lower().replace(" ", "-") for t in techs if t]

        industry_kws = _map_industries(filters.industries) if filters.industries else []
        tech_slugs   = _tech_slugs(filters.technologies) if filters.technologies else []

        # ── Build search variants ─────────────────────────────────────────────
        # Each variant is tagged with metadata used for signal augmentation.
        # Ordering: most-constrained (highest ICP precision) → broadest.
        #
        # Variant metadata tuple: (params_dict, is_tech_variant, is_funding_variant)
        variants: list[tuple[dict, bool, bool]] = []

        # V1 — All criteria combined: tech + industry + funding (Tier 1 candidates)
        if tech_slugs and industry_kws and apollo_stages:
            v = dict(base)
            v["q_organization_technology_slugs"] = tech_slugs
            v["q_organization_keyword_tags"] = industry_kws[:5]
            v["organization_latest_funding_stage_cd"] = apollo_stages
            variants.append((v, True, True))

        # V2 — Tech + funding (confirmed tech stack, target funding stage)
        if tech_slugs and apollo_stages:
            v = dict(base)
            v["q_organization_technology_slugs"] = tech_slugs
            v["organization_latest_funding_stage_cd"] = apollo_stages
            variants.append((v, True, True))

        # V3 — Tech only (confirmed stack, any stage — catches adjacent-stage companies)
        if tech_slugs:
            v = dict(base)
            v["q_organization_technology_slugs"] = tech_slugs
            variants.append((v, True, False))

        # V4 — Industry + funding (right vertical, target stage, no tech constraint)
        if industry_kws and apollo_stages:
            v = dict(base)
            v["q_organization_keyword_tags"] = industry_kws[:5]
            v["organization_latest_funding_stage_cd"] = apollo_stages
            variants.append((v, False, True))

        # V5 — Industry only (broad vertical sweep)
        if industry_kws:
            v = dict(base)
            v["q_organization_keyword_tags"] = industry_kws[:5]
            variants.append((v, False, False))

        # V6 — Funding only (catches funded companies outside named industry tags)
        if apollo_stages:
            v = dict(base)
            v["organization_latest_funding_stage_cd"] = apollo_stages
            variants.append((v, False, True))

        # Fallback — size + geo only
        if not variants:
            variants.append((dict(base), False, False))

        # ── Scoring-context tracking ──────────────────────────────────────────
        # These sets/dicts let us augment scoring dimensions that Apollo's
        # bulk_match API doesn't return, using what the search filter proved.
        domain_confirmed_techs: dict[str, set[str]] = {}  # techs confirmed by search filter
        domain_via_funding: set[str] = set()              # found by a funding-stage-filtered query
        domain_via_tech: set[str] = set()                 # found by a tech-stack-filtered query
        seen_domains: set[str] = set()

        _PAGES_PER_VARIANT = 2  # 2 pages × up to 6 variants = up to 1 200 raw results

        async with httpx.AsyncClient(timeout=30.0) as client:
            # ── Step 1: discover domains via targeted search variants ─────────
            for params, is_tech, is_funding in variants:
                variant_tech_labels = [
                    t.replace("-", " ").title()
                    for t in (params.get("q_organization_technology_slugs") or [])
                ]

                for page in range(1, _PAGES_PER_VARIANT + 1):
                    params["page"] = page
                    try:
                        resp = await client.post(
                            f"{APOLLO_BASE_URL}/mixed_companies/search",
                            headers=headers,
                            json=params,
                        )
                        resp.raise_for_status()
                        data = resp.json()
                    except httpx.HTTPStatusError as exc:
                        logger.error("ApolloSource HTTP %d: %s", exc.response.status_code, exc.response.text[:200])
                        break
                    except Exception as exc:
                        logger.error("ApolloSource request failed: %s", exc)
                        break

                    orgs = data.get("organizations") or []
                    if not orgs:
                        break

                    for org in orgs:
                        raw_domain = (org.get("primary_domain") or "").strip().lower()
                        if not raw_domain:
                            continue
                        key = _norm_domain(raw_domain)
                        seen_domains.add(key)

                        if is_tech and variant_tech_labels:
                            domain_confirmed_techs.setdefault(key, set()).update(variant_tech_labels)
                            domain_via_tech.add(key)

                        if is_funding:
                            domain_via_funding.add(key)

                    pagination = data.get("pagination") or {}
                    if page >= pagination.get("total_pages", 1):
                        break

            discovered_domains = list(seen_domains)
            logger.info(
                "ApolloSource: discovered %d unique domains across %d variants "
                "(%d via tech, %d via funding), enriching...",
                len(discovered_domains), len(variants),
                len(domain_via_tech), len(domain_via_funding),
            )

            # ── Step 2: bulk_match for full company profile ───────────────────
            _BATCH = 10
            fallback_loc = ", ".join(filters.locations) if filters.locations else _NF
            for i in range(0, len(discovered_domains), _BATCH):
                batch = discovered_domains[i : i + _BATCH]
                try:
                    enrich_resp = await client.post(
                        f"{APOLLO_BASE_URL}/organizations/bulk_match",
                        headers=headers,
                        json={"domains": batch, "reveal_personal_emails": False},
                        timeout=20.0,
                    )
                    enrich_resp.raise_for_status()
                    enriched_orgs = enrich_resp.json().get("organizations") or []
                except Exception as exc:
                    logger.warning("ApolloSource bulk_match failed for batch %d: %s", i, exc)
                    enriched_orgs = []

                for org in (enriched_orgs or []):
                    if not org:
                        continue
                    company = _normalise(org, fallback_location=fallback_loc)
                    if not company:
                        continue

                    key = _norm_domain(company.domain)

                    # Inject tech stack confirmed by search filter
                    confirmed = domain_confirmed_techs.get(key, set())
                    if confirmed:
                        existing = set(company.technologies_used)
                        company = company.model_copy(update={
                            "technologies_used": list(existing | confirmed)
                        })

                    # Add contextual signals from search-variant membership
                    company = _augment_signals(
                        company,
                        domain_via_funding=domain_via_funding,
                        domain_via_tech=domain_via_tech,
                        org=org,
                    )

                    results.append(company)

        logger.info("ApolloSource: returned %d enriched companies", len(results))
        return results
