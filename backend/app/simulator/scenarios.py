"""Scenario files. Each scenario describes one repository's CI behaviour, in plain JSON."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkflowSpec:
    name: str
    weight: float
    flakiness: float  # logit shift: how failure-prone the workflow is regardless of the change
    base_seconds: float


@dataclass(frozen=True)
class Scenario:
    name: str
    description: str
    workflows: tuple[WorkflowSpec, ...]
    authors: int
    inter_arrival_min: float
    base_fail_rate: float
    p_dependencies: float
    p_ci_config: float
    base_queue: float
    effects: dict[str, float]
    broken: dict[str, float]  # p_on / p_off of a workflow's "bad stretch"
    drift_per_1000_runs: float
    noise: float


def load_scenario(path: Path) -> Scenario:
    raw = json.loads(path.read_text())
    return Scenario(
        name=raw["name"],
        description=raw["description"],
        workflows=tuple(WorkflowSpec(**w) for w in raw["workflows"]),
        authors=int(raw["authors"]),
        inter_arrival_min=float(raw["inter_arrival_min"]),
        base_fail_rate=float(raw["base_fail_rate"]),
        p_dependencies=float(raw["p_dependencies"]),
        p_ci_config=float(raw["p_ci_config"]),
        base_queue=float(raw["base_queue"]),
        effects={k: float(v) for k, v in raw["effects"].items()},
        broken={k: float(v) for k, v in raw["broken"].items()},
        drift_per_1000_runs=float(raw["drift_per_1000_runs"]),
        noise=float(raw["noise"]),
    )


def load_scenarios(directory: Path) -> dict[str, Scenario]:
    """Load every ``*.json`` in the directory, keyed by scenario name (sorted for determinism)."""
    scenarios = [load_scenario(p) for p in sorted(directory.glob("*.json"))]
    return {s.name: s for s in scenarios}
