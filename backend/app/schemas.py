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
    count: int = Field(5, ge=1, le=200)
    seed: int | None = None
    drift: bool = False
    drift_queue_boost: float = 0.0


class TrainRequest(BaseModel):
    candidate: CandidateKind = "hist_gb"
    seed: int = 42


class SweepRequest(BaseModel):
    seeds: int = Field(5, ge=1, le=20)
    runs_per_scenario: int = Field(1000, ge=100, le=4000)
    candidate: CandidateKind = "hist_gb"


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


class GeneralisationRow(BaseModel):
    scenario: str
    majority_pr_auc: float
    logreg_pr_auc: float
    candidate_pr_auc: float


class ReportOut(BaseModel):
    model: ModelOut
    precision_target: float
    windows: dict[str, dict[str, str]]
    thresholds: list[dict[str, float]]
    pr_curves: dict[str, list[dict[str, float]]]
    reliability: dict[str, list[dict[str, float]]]
    generalisation: list[GeneralisationRow] | None = None


class MetricSpread(BaseModel):
    mean: float | None = None
    spread: float | None = None


class ModelSweepMetrics(BaseModel):
    pr_auc: MetricSpread
    brier: MetricSpread
    recall: MetricSpread
    recall_at_precision: MetricSpread | None = None


class LeaveOneOutRow(BaseModel):
    scenario: str
    majority_pr_auc: MetricSpread
    logreg_pr_auc: MetricSpread
    candidate_pr_auc: MetricSpread


class SweepOut(BaseModel):
    id: int
    created_at: datetime
    seeds: int
    runs_per_scenario: int
    candidate: str
    precision_target: float
    gate_pass_rate: float
    passed_seeds: int
    metrics: dict[str, ModelSweepMetrics]
    leave_one_out: list[LeaveOneOutRow] = Field(default_factory=list)


class AblationRow(BaseModel):
    group_id: str
    name: str
    features: list[str]
    pr_auc: MetricSpread
    delta_pr_auc: MetricSpread


class DeliberateLeakReport(BaseModel):
    forbidden_field: str
    contract_caught: bool
    contract_error: str
    gate_caught: bool
    gate_passed: bool
    gate_violations: list[str]


class AblationIn(BaseModel):
    seeds: int = Field(5, ge=1, le=20)
    runs_per_scenario: int = Field(1000, ge=100, le=5000)
    candidate: str = "hist_gb"


class AblationOut(BaseModel):
    id: int
    created_at: datetime
    seeds: int
    runs_per_scenario: int
    candidate: str
    full_model_pr_auc: MetricSpread
    groups: list[AblationRow]
    deliberate_leak: DeliberateLeakReport


class RealDataMissingFeature(BaseModel):
    feature: str
    reason: str


class RealDataReportOut(BaseModel):
    id: int
    created_at: datetime
    dataset_name: str
    doi: str
    licence: str
    total_rows: int
    candidate: str
    metrics: dict[str, Any]
    gate: dict[str, Any]
    thresholds: list[dict[str, Any]]
    importances: dict[str, float]
    available_features: list[str]
    missing_contract_features: list[RealDataMissingFeature]
    dropped_columns: list[str]


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


class NumericDriftRow(BaseModel):
    feature: str
    psi: float
    ks_statistic: float
    ks_pvalue: float
    status: str  # "stable" | "watch" | "shifted"
    reference_mean: float
    live_mean: float
    reference_std: float
    live_std: float
    recommendation: str


class CategoryShare(BaseModel):
    category: str
    reference_count: int
    reference_share: float
    live_count: int
    live_share: float
    delta: float


class CategoricalDriftRow(BaseModel):
    feature: str
    psi: float
    status: str  # "stable" | "watch" | "shifted"
    recommendation: str
    shares: list[CategoryShare]


class DriftReportOut(BaseModel):
    model_version: str | None
    reference_window: dict[str, str]
    live_window: dict[str, str]
    n_reference: int
    n_live: int
    overall_status: str  # "stable" | "watch" | "shifted"
    numeric_features: list[NumericDriftRow]
    categorical_features: list[CategoricalDriftRow]
