"""Metrics for a rare-event classifier: PR-AUC, recall at fixed precision, calibration."""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, precision_recall_curve

THRESHOLDS = (0.1, 0.2, 0.3, 0.4, 0.5)


def recall_at_precision(y_true: np.ndarray, p: np.ndarray, target: float) -> float | None:
    precision, recall, _ = precision_recall_curve(y_true, p)
    ok = precision >= target
    return float(recall[ok].max()) if ok.any() else None


def threshold_table(y_true: np.ndarray, p: np.ndarray) -> list[dict[str, float]]:
    rows = []
    for th in THRESHOLDS:
        flagged = p >= th
        tp = float(np.sum(flagged & (y_true == 1)))
        rows.append(
            {
                "threshold": th,
                "precision": tp / flagged.sum() if flagged.any() else 0.0,
                "recall": tp / max(1.0, float(np.sum(y_true == 1))),
                "flagged_share": float(flagged.mean()),
            }
        )
    return rows


def pr_curve_points(y_true: np.ndarray, p: np.ndarray, max_points: int = 60) -> list[dict[str, float]]:
    precision, recall, _ = precision_recall_curve(y_true, p)
    if len(recall) > max_points:
        keep = np.unique(np.linspace(0, len(recall) - 1, max_points).astype(int))
        precision, recall = precision[keep], recall[keep]
    return [{"recall": float(r), "precision": float(pr)} for r, pr in zip(recall, precision, strict=True)]


def reliability_points(y_true: np.ndarray, p: np.ndarray, bins: int = 8) -> list[dict[str, float]]:
    """Quantile bins of predicted probability against the observed failure share."""
    if len(p) < bins * 5:
        bins = max(2, len(p) // 5)
    order = np.argsort(p)
    points = []
    for chunk in np.array_split(order, bins):
        if len(chunk) == 0:
            continue
        points.append(
            {
                "mean_predicted": float(p[chunk].mean()),
                "observed_rate": float(y_true[chunk].mean()),
                "count": int(len(chunk)),
            }
        )
    return points


def score(y_true: np.ndarray, p: np.ndarray, precision_target: float) -> dict[str, Any]:
    y = np.asarray(y_true).astype(int)
    p = np.asarray(p, dtype=float)
    return {
        "pr_auc": float(average_precision_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "prevalence": float(y.mean()),
        "recall_at_precision": recall_at_precision(y, p, precision_target),
        "precision_target": precision_target,
        "n": int(len(y)),
    }
