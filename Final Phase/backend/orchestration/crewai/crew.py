from __future__ import annotations

from typing import Any

from agents import AGENT_SPECS, build_agents
from tasks import build_tasks

try:
    from crewai import Crew, Process  # type: ignore
except Exception:  # pragma: no cover
    Crew = None  # type: ignore
    Process = None  # type: ignore


def build_crew() -> Any:
    agents = build_agents()
    tasks = build_tasks(agents)

    if Crew is None or Process is None:
        return {"agents": agents, "tasks": tasks}

    return Crew(
        agents=[agents[key] for key in ["intake", "icp_scout", "buyer_intel", "signal_intel", "verifier", "storyteller", "campaign"]],
        tasks=tasks,
        process=Process.sequential,
        verbose=True,
    )


def run_crew() -> None:
    crew = build_crew()

    print("ABM Crew Agent Registry:")
    ordered_keys = ["intake", "icp_scout", "buyer_intel", "signal_intel", "verifier", "storyteller", "campaign"]
    for key in ordered_keys:
        spec = AGENT_SPECS[key]
        print(f"- {spec.role}: {spec.goal}")

    if isinstance(crew, dict):
        print("CrewAI dependencies not available; printed agent registry only.")
        return

    result = crew.kickoff(inputs={"run_mode": "test"})
    print("Crew run completed.")
    print(result)


if __name__ == "__main__":
    run_crew()
