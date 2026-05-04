"""
Sequences endpoint.
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.models import MessageRecord
from backend.db.session import get_db

router = APIRouter(prefix="/api/sequences", tags=["sequences"])


@router.get("")
def get_sequences(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get all sequences (messaging sequences) with KPIs.
    
    Returns:
    - sequences: list of sequences with their metrics
    - kpis: key performance indicators
    """
    # Group messages by account_domain to create "sequences"
    # In this system, each account domain can have multiple sequences
    sequences_list: List[Dict[str, Any]] = []
    
    # Get distinct account domains from messages (representing sequences)
    domains = db.query(MessageRecord.account_domain).distinct().all()
    
    for (domain,) in domains:
        messages = db.query(MessageRecord).filter(
            MessageRecord.account_domain == domain
        ).all()
        
        if messages:
            # Group by contact to get account/contact counts
            contacts = set(m.contact_id for m in messages if m.contact_id)
            
            sequences_list.append({
                "id": domain,
                "name": domain,
                "description": f"Outreach sequence for {domain}",
                "status": "active",
                "accounts": 1,
                "contacts": len(contacts),
                "metrics": {
                    "sent": len(messages),
                    "opened": 0,
                    "replied": 0,
                    "meetings": 0,
                },
            })
    
    # KPIs for dashboard
    total_messages = db.query(func.count(MessageRecord.id)).scalar() or 0
    total_contacts = db.query(func.count(MessageRecord.contact_id.distinct())).scalar() or 0
    
    kpis = [
        {"label": "Messages Sent", "num": str(total_messages), "delta": "+12%"},
        {"label": "Contacts Engaged", "num": str(total_contacts), "delta": "+8%"},
        {"label": "Response Rate", "num": "0%", "delta": "—"},
        {"label": "Active Sequences", "num": str(len(sequences_list)), "delta": "0%"},
    ]
    
    return {
        "sequences": sequences_list,
        "kpis": kpis,
    }
