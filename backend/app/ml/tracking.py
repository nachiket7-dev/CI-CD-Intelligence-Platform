"""Optional MLflow tracking for model training runs."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from ..config import Settings

logger = logging.getLogger(__name__)


def log_model_training(
    settings: Settings,
    *,
    version: str,
    algo: str,
    seed: int,
    metrics: dict[str, Any],
    gate: dict[str, Any],
    artifact_path: str | Path,
    n_train: int,
    n_val: int,
    n_test: int,
) -> str | None:
    """Log parameters, evaluation metrics, and the model artifact to MLflow if enabled.

    Off by default. Uses a local file store with no server.
    """
    if not settings.enable_mlflow:
        return None

    try:
        import mlflow
    except ImportError as err:
        logger.warning(
            "MLflow tracking is enabled but 'mlflow' is not installed: %s. Skipping tracking.",
            err,
        )
        return None

    tracking_uri = settings.mlflow_tracking_uri or f"file://{settings.models_dir.parent / 'data' / 'mlruns'}"
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(settings.mlflow_experiment_name)

    with mlflow.start_run(run_name=version) as run:
        mlflow.log_params(
            {
                "version": version,
                "candidate": algo,
                "seed": seed,
                "precision_target": settings.precision_target,
                "gate_margin": settings.gate_margin,
                "brier_tolerance": settings.brier_tolerance,
                "rolling_window": settings.rolling_window,
                "n_train": n_train,
                "n_val": n_val,
                "n_test": n_test,
                "gate_passed": gate.get("passed", False),
            }
        )

        metric_values: dict[str, float] = {}
        cand_metrics = metrics.get("candidate", {})
        if "pr_auc" in cand_metrics and cand_metrics["pr_auc"] is not None:
            metric_values["candidate_pr_auc"] = float(cand_metrics["pr_auc"])
        if "brier" in cand_metrics and cand_metrics["brier"] is not None:
            metric_values["candidate_brier"] = float(cand_metrics["brier"])
        if "brier_uncalibrated" in cand_metrics and cand_metrics["brier_uncalibrated"] is not None:
            metric_values["candidate_brier_uncalibrated"] = float(cand_metrics["brier_uncalibrated"])
        if "recall_at_precision" in cand_metrics and cand_metrics["recall_at_precision"] is not None:
            metric_values["candidate_recall"] = float(cand_metrics["recall_at_precision"])

        logreg_metrics = metrics.get("logreg", {})
        if "pr_auc" in logreg_metrics and logreg_metrics["pr_auc"] is not None:
            metric_values["logreg_pr_auc"] = float(logreg_metrics["pr_auc"])
        if "brier" in logreg_metrics and logreg_metrics["brier"] is not None:
            metric_values["logreg_brier"] = float(logreg_metrics["brier"])

        majority_metrics = metrics.get("majority", {})
        if "pr_auc" in majority_metrics and majority_metrics["pr_auc"] is not None:
            metric_values["majority_pr_auc"] = float(majority_metrics["pr_auc"])
        if "brier" in majority_metrics and majority_metrics["brier"] is not None:
            metric_values["majority_brier"] = float(majority_metrics["brier"])

        mlflow.log_metrics(metric_values)

        art_path = Path(artifact_path)
        if art_path.exists():
            mlflow.log_artifact(str(art_path))

        return run.info.run_id
