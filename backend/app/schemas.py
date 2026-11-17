"""Request and response shapes. The frontend mirrors these in ``frontend/src/lib/types.ts``."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RunStatus = Literal["pending", "passed", "failed"]
CandidateKind = Literal["hist_gb", "random_forest", "weak_stump"]


class SimulateRequest(BaseModel):
    scenarios: list[str] | None = Field(None, description="Scenario names; all if omitted.")
    runs_per_scenario: int = Field(1000, ge=100, le=4000)
    seed: int = 42
    pending: int = Field(8, ge=0, le=50, description="Most recent runs left without an outcome.")


class LiveRunsRequest(BaseModel):
    count: int = Field(5, ge=1, le=30)
    seed: int | None = None


class TrainRequest(BaseModel):
    candidate: CandidateKind = "hist_gb"
    seed: int = 42


class OutcomeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    failed: bool
    duration_s: float = Field(..., gt=0)


class Signal(BaseModel):
    feature: str
    value: float | int | str
    typical: float | int | str
    effect: float = Field(..., description="Change in failure probability versus a typical value.")


class OutcomeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    failed: bool
    duration_s: float
    finished_at: datetime
    recorded_at: datetime


class PredictionOut(BaseModel):
    id: int
    probability: float
    model_version: str
    predicted_at: datetime
    signals: list[Signal]
    features: dict[str, Any]


class RunOut(BaseModel):
    id: int
    repo: str
    workflow_name: str
    trigger_type: str
    author: str
    files_changed: int
    lines_changed: int
    touches_dependencies: bool
    touches_ci_config: bool
    queue_depth_at_start: int
    started_at: datetime
    status: RunStatus
    risk: float | None = None
    model_version: str | None = None


class TrailEvent(BaseModel):
    kind: Literal["started", "scored", "finished", "recorded"]
    label: str
    at: datetime
    clock: Literal["simulated", "system"]


class RunDetailOut(RunOut):
    prediction: PredictionOut | None = None
    outcome: OutcomeOut | None = None
    trail: list[TrailEvent]
    predicted_before_outcome: bool | None = None


class RunCounts(BaseModel):
    total: int
    pending: int
    passed: int
    failed: int


class RunListOut(BaseModel):
    items: list[RunOut]
    counts: RunCounts
    repos: list[str]


class ModelOut(BaseModel):
    id: int
    version: str
    algo: str
    seed: int
    status: Literal["candidate", "active", "rejected", "retired"]
    created_at: datetime
    n_train: int
    n_val: int
    n_test: int
    metrics: dict[str, Any]
    gate: dict[str, Any]
    importances: dict[str, float]


class ReportOut(BaseModel):
    model: ModelOut
    precision_target: float
    windows: dict[str, dict[str, str]]
    thresholds: list[dict[str, float]]
    pr_curves: dict[str, list[dict[str, float]]]
    reliability: dict[str, list[dict[str, float]]]


class TrackerOut(BaseModel):
    n_scored: int
    n_awaiting: int
    brier: float | None
    reliability: list[dict[str, float]]
    bands: list[dict[str, Any]]
    recent: list[dict[str, Any]]


class HealthOut(BaseModel):
    status: Literal["ok"]
    active_model: str | None
    runs: RunCounts
    scenarios: list[str]
