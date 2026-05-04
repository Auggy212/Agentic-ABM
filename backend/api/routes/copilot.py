"""
Copilot context and message endpoint.
"""

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.models import (
    ICPAccountRecord,
    MessageRecord,
)
from backend.db.session import get_db

router = APIRouter(prefix="/api/copilot", tags=["copilot"])


class CopilotMessage(BaseModel):
    """User message to Copilot."""
    message: str = Field(..., min_length=1, max_length=2000)
    context: Optional[Dict[str, Any]] = None


class CopilotResponse(BaseModel):
    """Copilot response."""
    text: str
    trace: Optional[List[Dict[str, Any]]] = None
    cards: Optional[List[Dict[str, Any]]] = None


def get_groq_response(user_message: str, context: Optional[Dict[str, Any]] = None) -> str:
    """Get response from Groq LLM."""
    try:
        from backend.services.groq_client import GroqClient
        
        # Only initialize if API key is available
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return "Groq API key not configured. Please set GROQ_API_KEY environment variable."
        
        client = GroqClient()
        
        # Build system prompt
        system_prompt = """You are an AI assistant for ABM (Account-Based Marketing) engine. 
You help users discover accounts, enrich buyer profiles, detect signals, and manage outreach campaigns.
Keep responses concise and actionable. When appropriate, suggest specific next steps."""
        
        # Build context info
        context_str = ""
        if context:
            context_str = f"\n\nCurrent context: {context.get('account_count', 0)} accounts, {context.get('sequence_count', 0)} sequences"
        
        messages = [
            {"role": "system", "content": system_prompt + context_str},
            {"role": "user", "content": user_message},
        ]
        
        response = client.chat(
            messages=messages,
            model="mixtral-8x7b-32768",
            temperature=0.7,
            max_tokens=512,
        )
        
        return response
    
    except ImportError:
        return "Groq client not available. Make sure the groq package is installed: pip install groq"
    except Exception as e:
        return f"Error: {str(e)}"


@router.get("/context")
def get_copilot_context(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get context for Copilot initialization.
    
    Returns:
    - greeting: welcome message
    - chips: quick action chips
    - initial_cards: suggested cards
    - account_count: total active accounts
    - sequence_count: total sequences
    - agent_run_label: status of agents
    """
    # Get counts from database
    account_count = db.query(func.count(ICPAccountRecord.id)).filter(
        ICPAccountRecord.is_removed == False
    ).scalar() or 0
    
    sequence_count = db.query(func.count(MessageRecord.id)).scalar() or 0
    
    return {
        "greeting": "Welcome back! Let's supercharge your outreach.",
        "chips": [
            "Find high-intent accounts",
            "Review buyer profiles",
            "Generate outreach messages",
            "Track campaign performance",
        ],
        "initial_cards": [
            {
                "title": "Get started with Phase 1",
                "body": "Upload a CSV of your target accounts to begin the discovery process.",
                "actions": ["Upload CSV", "Learn more"],
            },
            {
                "title": "Quick wins",
                "body": "Check out recent agent runs and their insights.",
                "actions": ["View agents"],
            },
        ],
        "account_count": account_count,
        "sequence_count": sequence_count,
        "agent_run_label": "all_idle",
    }


@router.post("/message")
def send_copilot_message(
    body: CopilotMessage,
    db: Session = Depends(get_db),
) -> CopilotResponse:
    """
    Send a message to Copilot and get an LLM-powered response.
    
    Uses Groq API for fast LLM inference.
    """
    # Get current context
    account_count = db.query(func.count(ICPAccountRecord.id)).filter(
        ICPAccountRecord.is_removed == False
    ).scalar() or 0
    
    sequence_count = db.query(func.count(MessageRecord.id)).scalar() or 0
    
    context = {
        "account_count": account_count,
        "sequence_count": sequence_count,
    }
    
    # Get response from Groq
    response_text = get_groq_response(body.message, context)
    
    return CopilotResponse(
        text=response_text,
        trace=[
            {"text": f"Parsing intent: {body.message[:50]}{'...' if len(body.message) > 50 else ''}", "done": True},
            {"text": "Querying account graph", "done": True},
            {"text": "Generating response", "done": True},
        ],
    )

