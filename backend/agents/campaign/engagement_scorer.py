from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db.models import EngagementEventRecord
from backend.schemas.models import EngagementEventType


HANDOFF_THRESHOLD = 60

# Per phase4_to_phase5_handoff.md
SCORE_TABLE: dict[EngagementEventType, int] = {
    EngagementEventType.EMAIL_REPLY: 25,
    EngagementEventType.LINKEDIN_DM_REPLY: 25,
    EngagementEventType.WHATSAPP_REPLY: 30,
    EngagementEventType.MEETING_BOOKED: 50,
    # Non-positive signals score zero toward handoff but are still recorded.
    EngagementEventType.EMAIL_OPEN: 0,
    EngagementEventType.EMAIL_BOUNCE: 0,
    EngagementEventType.EMAIL_UNSUBSCRIBE: 0,
    EngagementEventType.LINKEDIN_CONNECTION_ACCEPTED: 0,
    EngagementEventType.REPLY_NEGATIVE: 0,
}


def score_event(event_type: EngagementEventType) -> int:
    return SCORE_TABLE.get(event_type, 0)


def account_score(client_id: str, account_domain: str, db: Session) -> int:
    rows = (
        db.query(EngagementEventRecord)
        .filter(
            EngagementEventRecord.client_id == client_id,
            EngagementEventRecord.account_domain == account_domain,
        )
        .all()
    )
    return sum(int(r.score_delta) for r in rows)


def crosses_handoff_threshold(client_id: str, account_domain: str, db: Session) -> bool:
    return account_score(client_id, account_domain, db) >= HANDOFF_THRESHOLD
