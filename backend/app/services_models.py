"""Training, the registry, promotion and serving."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .clock import utcnow
from .config import Settings
from .contract import PRE_RUN_COLUMNS, validate_payload
from .ml import registry
from .ml.evaluate import reliability_points
from .ml.explain import top_signals
from .ml.features import build_features
from .ml.pipeline import run_experiment
from .orm import ModelRecord, Outcome, Prediction, Run
from .services_data import DomainError, NotFound, finished_runs_frame

_BUNDLES: dict[str, dict[str, Any]] = {}


def get_model(db: Session, model_id: int) -> ModelRecord:
    record = db.get(ModelRecord, model_id)
    if record is None:
        raise NotFound(f"Model {model_id} does not exist.")
    return record


def active_model(db: Session) -> ModelRecord | None:
    return db.scalar(select(ModelRecord).where(ModelRecord.status == "active"))


def train(db: Session, settings: Settings, candidate: str, seed: int) -> ModelRecord:
    frame = finished_runs_frame(db)
    try:
        exp = run_experiment(
            frame,
            seed=seed,
            candidate_kind=candidate,
            precision_target=settings.precision_target,
            gate_margin=settings.gate_margin,
            brier_tolerance=settings.brier_tolerance,
            rolling_window=settings.rolling_window,
        )
    except ValueError as err:
        raise DomainError(str(err)) from err

    next_id = (db.scalar(select(func.max(ModelRecord.id))) or 0) + 1
    version = f"v{next_id:03d}-{candidate}"
    path = registry.save_bundle(
        settings.models_dir, version, {"model": exp.model, "reference": exp.reference, "version": version}
    )
    record = ModelRecord(
        version=version,
        algo=candidate,
        seed=seed,
        status="candidate" if exp.gate.passed else "rejected",
        created_at=utcnow(),
        n_train=exp.n_train,
        n_val=exp.n_val,
        n_test=exp.n_test,
        metrics=exp.metrics,
        report={
            "precision_target": settings.precision_target,
            "windows": exp.windows,
            "thresholds": exp.thresholds,
            "pr_curves": exp.pr_curves,
            "reliability": exp.reliability,
        },
        importances=exp.importances,
        reference=exp.reference,
        gate=exp.gate.to_dict(),
        artifact_path=str(path),
    )
    db.add(record)
    db.commit()
    return record


def promote(db: Session, record: ModelRecord) -> ModelRecord:
    if record.status == "active":
        raise DomainError(f"{record.version} is already the active model.")
    if record.status != "candidate" or not record.gate.get("passed"):
        raise DomainError(
            f"{record.version} was rejected by the gate and cannot be promoted. {record.gate['reason']}"
        )
    db.execute(update(ModelRecord).where(ModelRecord.status == "active").values(status="retired"))
    record.status = "active"
    db.commit()
    return record


def _bundle(record: ModelRecord) -> dict[str, Any]:
    if record.artifact_path not in _BUNDLES:
        _BUNDLES[record.artifact_path] = registry.load_bundle(record.artifact_path)
    return _BUNDLES[record.artifact_path]


def _score_frame(db: Session, settings: Settings, targets: pd.DataFrame, record: ModelRecord):
    history = finished_runs_frame(db)
    feats = build_features(targets, history, window=settings.rolling_window)
    bundle = _bundle(record)
    return top_signals(bundle["model"], feats, bundle["reference"]), feats.iloc[0].to_dict()


def _plain(d: dict[str, Any]) -> dict[str, Any]:
    return {k: (v.item() if hasattr(v, "item") else v) for k, v in d.items()}


def predict_for_run(db: Session, settings: Settings, run: Run) -> Prediction:
    record = active_model(db)
    if record is None:
        raise DomainError("No active model yet. Train a candidate and promote it first.")
    if run.outcome is not None:
        raise DomainError(f"Run {run.id} already finished, so scoring it now would be hindsight.")
    targets = pd.DataFrame([{c: getattr(run, c) for c in PRE_RUN_COLUMNS}])
    targets["started_at"] = pd.to_datetime(targets["started_at"])
    (prob, signals), feats = _score_frame(db, settings, targets, record)
    prediction = Prediction(
        run_id=run.id,
        model_id=record.id,
        probability=prob,
        features=_plain(feats),
        signals=signals,
        predicted_at=utcnow(),
    )
    db.add(prediction)
    db.commit()
    db.refresh(run)
    return prediction


def predict_payload(db: Session, settings: Settings, payload: dict[str, Any]) -> dict[str, Any]:
    """Score an ad-hoc run described only by pre-run fields. Nothing is stored."""
    validate_payload(payload)  # raises ContractViolation if post-run fields are present
    record = active_model(db)
    if record is None:
        raise DomainError("No active model yet. Train a candidate and promote it first.")
    row = {k: payload.get(k) for k in PRE_RUN_COLUMNS if k != "started_at"}
    missing = [k for k, v in row.items() if v is None]
    if missing:
        raise DomainError("Missing pre-run fields: " + ", ".join(missing))
    last = db.scalar(select(func.max(Run.started_at)))
    row["started_at"] = pd.to_datetime(payload.get("started_at") or last or datetime(2026, 1, 5))
    targets = pd.DataFrame([row])
    (prob, signals), feats = _score_frame(db, settings, targets, record)
    return {
        "probability": prob,
        "model_version": record.version,
        "signals": signals,
        "features": _plain(feats),
    }


def tracker(db: Session) -> dict[str, Any]:
    """Prediction versus reality, using only predictions made before the outcome existed."""
    latest = (
        select(Prediction.run_id, func.max(Prediction.id).label("pid")).group_by(Prediction.run_id).subquery()
    )
    rows = db.execute(
        select(Prediction, Outcome)
        .join(latest, latest.c.pid == Prediction.id)
        .outerjoin(Outcome, Outcome.run_id == Prediction.run_id)
        .order_by(Prediction.predicted_at.desc())
    ).all()
    scored = [(p, o) for p, o in rows if o is not None and p.predicted_at <= o.recorded_at]
    awaiting = sum(1 for _, o in rows if o is None)
    probs = np.array([p.probability for p, _ in scored])
    y = np.array([int(o.failed) for _, o in scored])
    bands = []
    for label, lo, hi in (("Low", 0.0, 0.2), ("Medium", 0.2, 0.5), ("High", 0.5, 1.01)):
        sel = (probs >= lo) & (probs < hi) if len(probs) else np.array([], dtype=bool)
        bands.append(
            {
                "label": label,
                "range": [lo, min(hi, 1.0)],
                "count": int(sel.sum()),
                "failure_rate": float(y[sel].mean()) if sel.any() else None,
            }
        )
    return {
        "n_scored": len(scored),
        "n_awaiting": awaiting,
        "brier": float(np.mean((probs - y) ** 2)) if len(scored) else None,
        "reliability": reliability_points(y, probs, bins=4) if len(scored) >= 20 else [],
        "bands": bands,
        "recent": [
            {
                "run_id": p.run_id,
                "probability": p.probability,
                "failed": o.failed,
                "predicted_at": p.predicted_at,
                "recorded_at": o.recorded_at,
            }
            for p, o in scored[:25]
        ],
    }
