"""Service for running time-ordered evaluation on real-world CI/CD data."""

from __future__ import annotations

from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..clock import utcnow
from ..config import Settings
from ..ml.pipeline import Experiment, run_experiment
from ..orm import RealDataRecord
from ..services_data import NotFound
from .loader import (
    AVAILABLE_CONTRACT_FEATURES,
    DATASET_DOI,
    DATASET_LICENCE,
    DATASET_NAME,
    DROPPED_COLUMNS,
    UNBUILDABLE_CONTRACT_FEATURES,
    load_realdata,
)


def evaluate_realdata(
    df: pd.DataFrame,
    settings: Settings,
    candidate: str = "hist_gb",
    seed: int = 42,
) -> dict[str, Any]:
    """Execute time-ordered experiment on real dataset and evaluate gate decision."""
    exp: Experiment = run_experiment(
        df,
        seed=seed,
        candidate_kind=candidate,
        precision_target=settings.precision_target,
        gate_margin=settings.gate_margin,
        brier_tolerance=settings.brier_tolerance,
        rolling_window=settings.rolling_window,
    )

    return {
        "dataset_name": DATASET_NAME,
        "doi": DATASET_DOI,
        "licence": DATASET_LICENCE,
        "total_rows": len(df),
        "candidate": candidate,
        "n_train": exp.n_train,
        "n_val": exp.n_val,
        "n_test": exp.n_test,
        "windows": exp.windows,
        "metrics": exp.metrics,
        "gate": exp.gate.to_dict(),
        "thresholds": exp.thresholds,
        "importances": exp.importances,
        "available_features": AVAILABLE_CONTRACT_FEATURES,
        "missing_contract_features": UNBUILDABLE_CONTRACT_FEATURES,
        "dropped_columns": DROPPED_COLUMNS,
    }


def run_and_save_realdata(
    db: Session,
    settings: Settings,
    csv_path: str,
    candidate: str = "hist_gb",
    max_rows: int | None = None,
    seed: int = 42,
) -> RealDataRecord:
    """Load CSV, evaluate pipeline and gate, and save the report in database."""
    clean_df, metadata = load_realdata(csv_path, max_rows=max_rows)
    report = evaluate_realdata(clean_df, settings, candidate=candidate, seed=seed)

    record = RealDataRecord(
        created_at=utcnow(),
        dataset_name=report["dataset_name"],
        doi=report["doi"],
        licence=report["licence"],
        total_rows=report["total_rows"],
        candidate=report["candidate"],
        metrics=report["metrics"],
        gate=report["gate"],
        thresholds=report["thresholds"],
        importances=report["importances"],
        available_features=report["available_features"],
        missing_contract_features=report["missing_contract_features"],
        dropped_columns=report["dropped_columns"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_latest_realdata(db: Session) -> RealDataRecord:
    rec = db.scalars(select(RealDataRecord).order_by(RealDataRecord.created_at.desc())).first()
    if rec is None:
        raise NotFound("No real-world dataset report yet. Run `python -m app.cli realdata` first.")
    return rec
