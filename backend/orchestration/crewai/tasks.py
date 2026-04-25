from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

try:
    from crewai import Task  # type: ignore
except Exception:  # pragma: no cover
    Task = None  # type: ignore


@dataclass
class TaskSpec:
    description: str
    expected_output: str


TASK_SPECS: Dict[str, TaskSpec] = {
    "intake": TaskSpec(
        description="Parse intake submission and produce a normalized master context JSON payload.",
        expected_output="Validated master context object ready for account discovery.",
    ),
    "icp_scout": TaskSpec(
        description="Discover and score target companies matching the ICP.",
        expected_output="Ranked account list with tier and explainable ICP scoring factors.",
    ),
    "buyer_intel": TaskSpec(
        description="Identify buying committee members and assign stakeholder roles.",
        expected_output="Structured committee map with confidence scores by contact.",
    ),
    "signal_intel": TaskSpec(
        description="Aggregate intent and trigger signals to infer buying stage.",
        expected_output="Signal report containing stage classification and action recommendations.",
    ),
    "verifier": TaskSpec(
        description="Run pre-launch verification checks across data and messaging artifacts.",
        expected_output="Readiness report with pass/fail checks and remediation actions.",
    ),
    "storyteller": TaskSpec(
        description="Generate personalized multi-channel messaging for each committee member.",
        expected_output="Message package by contact and channel with clear CTA.",
    ),
    "campaign": TaskSpec(
        description="Launch campaign plan and define lead scoring and handoff steps.",
        expected_output="Execution plan with engagement checkpoints and handoff conditions.",
    ),
}


def build_tasks(agents: Dict[str, Any]) -> List[Any]:
    ordered_keys = ["intake", "icp_scout", "buyer_intel", "signal_intel", "verifier", "storyteller", "campaign"]
    tasks: List[Any] = []

    for key in ordered_keys:
        spec = TASK_SPECS[key]
        if Task is None:
            tasks.append(spec)
        else:
            tasks.append(Task(description=spec.description, expected_output=spec.expected_output, agent=agents[key]))
    return tasks
