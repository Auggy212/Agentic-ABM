"""
Dashboard navigation metrics endpoint.
"""

from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.models import (
    ICPAccountRecord,
    MessageRecord,
)
from backend.db.session import get_db

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/nav-counts")
def get_nav_counts(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get navigation counts for dashboard.
    
    Returns:
    - accounts: count of active ICP accounts (not removed)
    - sequences: count of messages/sequences
    - agents: string status summary
    """
    # Count active ICP accounts (not removed)
    accounts_count = db.query(func.count(ICPAccountRecord.id)).filter(
        ICPAccountRecord.is_removed == False
    ).scalar() or 0

    # Count message sequences
    sequences_count = db.query(func.count(MessageRecord.id)).scalar() or 0

    # Agent status summary
    agents_status = "all_idle"

    return {
        "accounts": accounts_count,
        "sequences": sequences_count,
        "agents": agents_status,
    }
