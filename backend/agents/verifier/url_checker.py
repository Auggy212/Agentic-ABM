"""Pure HTTP URL checks for Phase 3 verification."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import requests

logger = logging.getLogger(__name__)


@dataclass
class UrlCheckResult:
    url: str
    reachable: bool
    http_status: Optional[int]
    checked_at: datetime


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _is_reachable(status: Optional[int], *, is_linkedin: bool) -> bool:
    if status is None:
        return False
    if is_linkedin and status == 999:
        return True
    return 200 <= status <= 399


def _request(method: str, url: str, timeout: int) -> requests.Response:
    if method == "HEAD":
        return requests.head(url, timeout=timeout, allow_redirects=True)
    return requests.get(url, timeout=timeout, allow_redirects=True, stream=True)


def check_url(url: str, timeout: int = 10) -> UrlCheckResult:
    """
    HEAD first; if HEAD fails or returns 405, fall back to streaming GET.
    5xx responses are retried twice with backoff.
    """
    is_linkedin = "linkedin.com" in url.lower()
    last_status: Optional[int] = None
    delay = 0.5

    for attempt in range(3):
        try:
            response = _request("HEAD", url, timeout)
            last_status = response.status_code
            if last_status == 405:
                response = _request("GET", url, timeout)
                last_status = response.status_code
        except requests.RequestException as exc:
            logger.debug("HEAD failed for %s (%s); falling back to GET", url, exc)
            try:
                response = _request("GET", url, timeout)
                last_status = response.status_code
            except requests.RequestException as get_exc:
                logger.warning("URL check failed for %s: %s", url, get_exc)
                return UrlCheckResult(
                    url=url,
                    reachable=False,
                    http_status=last_status,
                    checked_at=_now(),
                )

        if last_status is not None and 500 <= last_status <= 599 and attempt < 2:
            time.sleep(delay)
            delay *= 2
            continue

        return UrlCheckResult(
            url=url,
            reachable=_is_reachable(last_status, is_linkedin=is_linkedin),
            http_status=last_status,
            checked_at=_now(),
        )

    return UrlCheckResult(
        url=url,
        reachable=_is_reachable(last_status, is_linkedin=is_linkedin),
        http_status=last_status,
        checked_at=_now(),
    )
