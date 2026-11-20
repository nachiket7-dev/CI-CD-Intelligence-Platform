"""Database tables.

Outcomes live in their own table, apart from the pre-run fields of a run. That separation makes
leakage structurally harder, and lets timestamps prove a prediction was made before its outcome.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Run(Base):
    """One CI run, with only what is known when it starts."""

    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repo: Mapped[str] = mapped_column(String(80), index=True)
    workflow_name: Mapped[str] = mapped_column(String(80))
    trigger_type: Mapped[str] = mapped_column(String(24))
    author: Mapped[str] = mapped_column(String(40))
    files_changed: Mapped[int] = mapped_column(Integer)
    lines_changed: Mapped[int] = mapped_column(Integer)
    touches_dependencies: Mapped[int] = mapped_column(Integer)
    touches_ci_config: Mapped[int] = mapped_column(Integer)
    queue_depth_at_start: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime, index=True)  # simulated time

    outcome: Mapped[Outcome | None] = relationship(back_populates="run", uselist=False)
    predictions: Mapped[list[Prediction]] = relationship(
        back_populates="run", order_by="Prediction.predicted_at"
    )


class Outcome(Base):
    __tablename__ = "outcomes"

    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), primary_key=True)
    failed: Mapped[bool] = mapped_column(Boolean)
    duration_s: Mapped[float] = mapped_column(Float)
    finished_at: Mapped[datetime] = mapped_column(DateTime)  # simulated time
    recorded_at: Mapped[datetime] = mapped_column(DateTime)  # system time

    run: Mapped[Run] = relationship(back_populates="outcome")


class SimTruth(Base):
    """The simulator's hidden result for runs still pending. Only the simulator reads this."""

    __tablename__ = "sim_truth"

    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), primary_key=True)
    failed: Mapped[bool] = mapped_column(Boolean)
    duration_s: Mapped[float] = mapped_column(Float)


class ModelRecord(Base):
    """The model registry: one row per trained candidate, with its baseline comparison."""

    __tablename__ = "models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version: Mapped[str] = mapped_column(String(60), unique=True)
    algo: Mapped[str] = mapped_column(String(40))
    seed: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), index=True)  # candidate|active|rejected|retired
    created_at: Mapped[datetime] = mapped_column(DateTime)
    n_train: Mapped[int] = mapped_column(Integer)
    n_val: Mapped[int] = mapped_column(Integer)
    n_test: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON)
    report: Mapped[dict[str, Any]] = mapped_column(JSON)
    importances: Mapped[dict[str, Any]] = mapped_column(JSON)
    reference: Mapped[dict[str, Any]] = mapped_column(JSON)
    gate: Mapped[dict[str, Any]] = mapped_column(JSON)
    artifact_path: Mapped[str] = mapped_column(String(300))


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), index=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("models.id"))
    probability: Mapped[float] = mapped_column(Float)
    features: Mapped[dict[str, Any]] = mapped_column(JSON)
    signals: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    predicted_at: Mapped[datetime] = mapped_column(DateTime)  # system time

    run: Mapped[Run] = relationship(back_populates="predictions")
    model: Mapped[ModelRecord] = relationship()


class SweepRecord(Base):
    """Result of an in-memory sweep of baselines vs candidate over several seeds."""

    __tablename__ = "sweeps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    seeds: Mapped[int] = mapped_column(Integer)
    runs_per_scenario: Mapped[int] = mapped_column(Integer)
    candidate: Mapped[str] = mapped_column(String(40))
    precision_target: Mapped[float] = mapped_column(Float)
    gate_pass_rate: Mapped[float] = mapped_column(Float)
    passed_seeds: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON)
    leave_one_out: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class AblationRecord(Base):
    """Result of feature ablation study and deliberate leakage verification."""

    __tablename__ = "ablations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    seeds: Mapped[int] = mapped_column(Integer)
    runs_per_scenario: Mapped[int] = mapped_column(Integer)
    candidate: Mapped[str] = mapped_column(String(40))
    full_model_pr_auc: Mapped[dict[str, float]] = mapped_column(JSON)
    groups: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    deliberate_leak: Mapped[dict[str, Any]] = mapped_column(JSON)


class RealDataRecord(Base):
    """Result of an evaluation check on the public real-world CI/CD dataset."""

    __tablename__ = "realdata_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    dataset_name: Mapped[str] = mapped_column(String(120))
    doi: Mapped[str] = mapped_column(String(60))
    licence: Mapped[str] = mapped_column(String(40))
    total_rows: Mapped[int] = mapped_column(Integer)
    candidate: Mapped[str] = mapped_column(String(40))
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON)
    gate: Mapped[dict[str, Any]] = mapped_column(JSON)
    thresholds: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    importances: Mapped[dict[str, float]] = mapped_column(JSON)
    available_features: Mapped[list[str]] = mapped_column(JSON)
    missing_contract_features: Mapped[list[dict[str, str]]] = mapped_column(JSON)
    dropped_columns: Mapped[list[str]] = mapped_column(JSON)
