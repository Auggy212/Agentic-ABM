"""
Startup configuration validator.

Called once during app lifespan to surface missing API keys and
misconfigured env vars before any request is served. Uses a
warn-not-crash strategy for optional integrations and raises
RuntimeError only for keys that are truly required for any request to
succeed (e.g. DATABASE_URL).
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Keys that must be present for the app to function at all
_REQUIRED_KEYS: list[str] = [
    "DATABASE_URL",
    "SECRET_KEY",
    "OPENAI_API_KEY",
]

# Keys needed for specific agents; missing ones are warnings, not errors
_OPTIONAL_KEYS: dict[str, str] = {
    "ANTHROPIC_API_KEY":    "Storyteller TIER_1 (Claude) messages will be skipped",
    "APOLLO_API_KEY":       "ICP Scout and Buyer Intel contact discovery will be skipped",
    "NEVERBOUNCE_API_KEY":  "Email verification (Phase 3) will be skipped",
    "ZEROBOUNCE_API_KEY":   "ZeroBounce secondary email verification will be unavailable",
    "HUNTER_API_KEY":       "Hunter email discovery and re-lookup will be unavailable",
    "GROQ_API_KEY":         "Copilot RAG (GROQ) will be unavailable",
    "BUILTWITH_API_KEY":    "BuiltWith tech-stack enrichment will be skipped",
    "REDDIT_CLIENT_ID":     "Reddit signal source will be disabled",
    "REDDIT_CLIENT_SECRET": "Reddit signal source will be disabled",
}


def validate_config(*, raise_on_missing_required: bool = True) -> list[str]:
    """
    Check all known config keys. Returns a list of warning strings.
    Raises RuntimeError if any required key is absent and
    raise_on_missing_required is True.
    """
    warnings: list[str] = []
    missing_required: list[str] = []

    for key in _REQUIRED_KEYS:
        if not os.environ.get(key):
            missing_required.append(key)

    if missing_required and raise_on_missing_required:
        raise RuntimeError(
            "ABM Engine cannot start — required env vars missing: "
            + ", ".join(missing_required)
        )

    for key, impact in _OPTIONAL_KEYS.items():
        if not os.environ.get(key):
            msg = f"Optional API key {key!r} not set — {impact}"
            warnings.append(msg)
            logger.warning("Config: %s", msg)

    if not missing_required and not warnings:
        logger.info("Config: all API keys present")
    elif missing_required:
        logger.error("Config: MISSING required keys: %s", ", ".join(missing_required))

    return warnings
