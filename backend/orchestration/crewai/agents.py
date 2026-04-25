from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

try:
    from crewai import Agent  # type: ignore
    from langchain_anthropic import ChatAnthropic  # type: ignore
except Exception:  # pragma: no cover - fallback for environments without deps
    Agent = None  # type: ignore
    ChatAnthropic = None  # type: ignore


@dataclass
class AgentSpec:
    role: str
    goal: str
    backstory: str


AGENT_SPECS: Dict[str, AgentSpec] = {
    "intake": AgentSpec(
        role="Intake Context Architect",
        goal="Normalize intake payload into canonical master context for downstream ABM agents.",
        backstory="You specialize in transforming messy inbound ABM requirements into a clean, machine-readable context object that every downstream agent can trust.",
    ),
    "icp_scout": AgentSpec(
        role="ICP Scout Analyst",
        goal="Score and tier accounts against ICP constraints with explainable factor-level rationale.",
        backstory="You are a GTM analyst focused on identifying high-fit target accounts and justifying every score with transparent weighting.",
    ),
    "buyer_intel": AgentSpec(
        role="Buyer Committee Mapper",
        goal="Map buying committee members, roles, and confidence scores for target accounts.",
        backstory="You reconstruct buying committees from sparse signals and prioritize stakeholder influence to improve multi-threaded outreach.",
    ),
    "signal_intel": AgentSpec(
        role="Intent Signal Strategist",
        goal="Aggregate intent signals and classify account buying stage with concise intelligence reports.",
        backstory="You monitor trigger events and behavior signals to determine when accounts are entering active buying windows.",
    ),
    "verifier": AgentSpec(
        role="Readiness Verifier",
        goal="Validate account, contact, signal, and messaging readiness before campaign launch.",
        backstory="You act as a quality gate for ABM execution by enforcing data accuracy, deliverability confidence, and launch readiness criteria.",
    ),
    "storyteller": AgentSpec(
        role="ABM Storyteller",
        goal="Generate multi-channel personalized messaging packages for each buyer persona.",
        backstory="You craft persona-aware narratives that adapt across channels while preserving strategic message consistency.",
    ),
    "campaign": AgentSpec(
        role="Campaign Orchestrator",
        goal="Launch outbound campaigns, track engagement, score leads, and orchestrate sales handoff.",
        backstory="You coordinate execution sequencing from first touch to qualified handoff, balancing throughput with quality outcomes.",
    ),
}


def _build_llm() -> Any:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if ChatAnthropic is None or not api_key:
        return None
    return ChatAnthropic(model="claude-sonnet-4-20250514", anthropic_api_key=api_key, temperature=0)


def build_agents() -> Dict[str, Any]:
    llm = _build_llm()
    agents: Dict[str, Any] = {}
    for key, spec in AGENT_SPECS.items():
        if Agent is None:
            agents[key] = spec
        else:
            agents[key] = Agent(role=spec.role, goal=spec.goal, backstory=spec.backstory, llm=llm, verbose=True)
    return agents
