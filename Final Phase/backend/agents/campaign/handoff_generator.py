from __future__ import annotations

import os
from collections import Counter
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.agents.campaign import engagement_scorer
from backend.db.models import EngagementEventRecord
from backend.schemas.models import EngagementEventType


# Master prompt §5: Sales Handoff TL;DR uses claude-haiku for cost; templated
# structure handles everything around the LLM call. Keep the template path
# deterministic so dashboards and tests stay stable.

_POSITIVE_EVENTS = {
    EngagementEventType.EMAIL_REPLY,
    EngagementEventType.LINKEDIN_DM_REPLY,
    EngagementEventType.WHATSAPP_REPLY,
    EngagementEventType.MEETING_BOOKED,
}

_HUMAN: dict[EngagementEventType, str] = {
    EngagementEventType.EMAIL_REPLY: "email reply",
    EngagementEventType.LINKEDIN_DM_REPLY: "LinkedIn DM reply",
    EngagementEventType.WHATSAPP_REPLY: "WhatsApp reply",
    EngagementEventType.MEETING_BOOKED: "meeting booked",
}


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def generate_tldr(
    *,
    client_id: str,
    account_domain: str,
    contact_id: str,
    db: Session,
    use_mock: bool | None = None,
) -> str:
    """
    Build the Sales-Exec-ready TL;DR for a CP4 handoff. Default (mock) path is
    a deterministic template the tests can pin. The live path (env-flagged)
    will swap in claude-haiku — its output replaces only the narrative
    sentence; the structured header stays templated for dashboard parsing.
    """
    if use_mock is None:
        use_mock = os.environ.get("HANDOFF_GENERATOR_USE_MOCK", "1") == "1"

    score = engagement_scorer.account_score(client_id, account_domain, db)
    rows = (
        db.query(EngagementEventRecord)
        .filter(
            EngagementEventRecord.client_id == client_id,
            EngagementEventRecord.account_domain == account_domain,
        )
        .order_by(EngagementEventRecord.occurred_at.asc())
        .all()
    )
    positive = [r for r in rows if EngagementEventType(r.event_type) in _POSITIVE_EVENTS]
    counts = Counter(EngagementEventType(r.event_type) for r in positive)
    headline_parts = [f"{n}× {_HUMAN[evt]}" for evt, n in counts.most_common()]
    headline = ", ".join(headline_parts) if headline_parts else "no positive engagement on record"

    last = positive[-1] if positive else None
    last_label = _HUMAN.get(EngagementEventType(last.event_type), "engagement") if last else None
    last_when = last.occurred_at.strftime("%Y-%m-%d") if last else "n/a"

    if use_mock:
        narrative = (
            f"Champion at {account_domain} engaged {headline}. "
            f"Most recent: {last_label} on {last_when}."
        ) if last else f"Account {account_domain} crossed engagement threshold."
    else:
        # Live claude-haiku wiring deferred to Phase 5b. Until then, mirror mock
        # output so behaviour is identical and the toggle is safe to flip.
        narrative = (
            f"Champion at {account_domain} engaged {headline}. "
            f"Most recent: {last_label} on {last_when}."
        ) if last else f"Account {account_domain} crossed engagement threshold."

    return (
        f"[CP4 Handoff] account={account_domain} contact={contact_id} score={score}\n"
        f"Triggers: {headline}\n"
        f"{narrative}"
    )
