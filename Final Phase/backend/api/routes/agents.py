"""
Agents status endpoint.
"""

from typing import Any, Dict, List
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.models import (
    ICPRunRecord,
    BuyerIntelRunRecord,
    SignalIntelRunRecord,
    VerifiedRunRecord,
)
from backend.db.session import get_db

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("")
def get_agents(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get status of all agents with their activity.
    
    Returns:
    - agents: list of agent objects with id, name, status, icon, description, runs
    - events: list of recent activity events
    """
    agents_list: List[Dict[str, Any]] = []

    # ICP Scout Agent
    latest_icp_run = db.query(ICPRunRecord).order_by(ICPRunRecord.started_at.desc()).first()
    icp_status = latest_icp_run.status if latest_icp_run else "idle"
    icp_runs = f"{latest_icp_run.total_found} accounts found" if latest_icp_run else "0 runs"
    agents_list.append({
        "id": "icp-scout",
        "name": "ICP Scout",
        "status": icp_status,
        "icon": "target",
        "description": "Discovers high-intent accounts matching your ICP",
        "runs": icp_runs,
    })

    # Buyer Intel Agent
    latest_buyer_run = db.query(BuyerIntelRunRecord).order_by(BuyerIntelRunRecord.started_at.desc()).first()
    buyer_status = latest_buyer_run.status if latest_buyer_run else "idle"
    buyer_runs = f"{latest_buyer_run.total_contacts} contacts enriched" if latest_buyer_run else "0 runs"
    agents_list.append({
        "id": "buyer-intel",
        "name": "Buyer Intel",
        "status": buyer_status,
        "icon": "users",
        "description": "Enriches buyer profiles with intent and role data",
        "runs": buyer_runs,
    })

    # Signal Intel Agent
    latest_signal_run = db.query(SignalIntelRunRecord).order_by(SignalIntelRunRecord.started_at.desc()).first()
    signal_status = latest_signal_run.status if latest_signal_run else "idle"
    signal_runs = f"{latest_signal_run.total_accounts} accounts analyzed" if latest_signal_run else "0 runs"
    agents_list.append({
        "id": "signal-intel",
        "name": "Signal Intel",
        "status": signal_status,
        "icon": "activity",
        "description": "Detects buying signals from account activity",
        "runs": signal_runs,
    })

    # Verification Agent
    latest_verify_run = db.query(VerifiedRunRecord).order_by(VerifiedRunRecord.started_at.desc()).first()
    verify_status = latest_verify_run.status if latest_verify_run else "idle"
    verify_runs = f"{(latest_verify_run.deliverability_rate * 100):.0f}% deliverable" if latest_verify_run else "0 runs"
    agents_list.append({
        "id": "verifier",
        "name": "Verifier",
        "status": verify_status,
        "icon": "check",
        "description": "Validates contact data and email deliverability",
        "runs": verify_runs,
    })

    # Other agents without tracked runs
    agents_list.extend([
        {
            "id": "cp2-review",
            "name": "CP2 Review",
            "status": "idle",
            "icon": "list",
            "description": "Reviews and approves Phase 2 buyer data",
            "runs": "0 runs",
        },
        {
            "id": "cp3-verification",
            "name": "CP3 Verification",
            "status": "idle",
            "icon": "check-circle",
            "description": "Verifies Phase 3 messaging and sequence setup",
            "runs": "0 runs",
        },
        {
            "id": "storyteller",
            "name": "Storyteller",
            "status": "idle",
            "icon": "sparkle",
            "description": "Generates personalized outreach messages",
            "runs": "0 runs",
        },
        {
            "id": "recent-activity",
            "name": "Recent Activity",
            "status": "idle",
            "icon": "clock",
            "description": "Scrapes recent account activity signals",
            "runs": "0 runs",
        },
    ])

    # Empty events list for now (can be populated with actual agent run logs later)
    events_list: List[Dict[str, Any]] = []

    return {
        "agents": agents_list,
        "events": events_list,
    }
