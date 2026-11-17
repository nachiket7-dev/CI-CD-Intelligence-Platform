"""Training and evaluation: baselines against a candidate, on a time-ordered split."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier

from ..contract import CATEGORICAL_FEATURES, FEATURE_COLUMNS, NUMERIC_FEATURES, check_columns
from . import evaluate
from .features import build_features
from .gate import GateDecision, evaluate_gate
from .split import time_split

CANDIDATE_KINDS = ("hist_gb", "random_forest", "weak_stump")
MIN_RUNS = 300


def _preprocessor(scale: bool) -> ColumnTransformer:
    return ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_FEATURES),
            ("num", StandardScaler() if scale else "passthrough", NUMERIC_FEATURES),
        ],
        verbose_feature_names_out=False,
    )


def build_estimator(kind: str, seed: int):
    if kind == "majority":
        return DummyClassifier(strategy="prior")
    if kind == "logreg":
        clf = LogisticRegression(max_iter=2000, C=1.0)
        return Pipeline([("prep", _preprocessor(True)), ("clf", clf)])
    if kind == "hist_gb":
        clf = HistGradientBoostingClassifier(
            learning_rate=0.06,
            max_iter=250,
            max_depth=4,
            min_samples_leaf=20,
            l2_regularization=1.0,
            random_state=seed,
        )
    elif kind == "random_forest":
        clf = RandomForestClassifier(n_estimators=300, min_samples_leaf=5, n_jobs=-1, random_state=seed)
    elif kind == "weak_stump":  # deliberately weak, to show the gate rejecting a model
        clf = DecisionTreeClassifier(max_depth=1, random_state=seed)
    else:
        raise ValueError(f"Unknown model kind '{kind}'. Choose one of {CANDIDATE_KINDS}.")
    return Pipeline([("prep", _preprocessor(False)), ("clf", clf)])


def _logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


class CalibratedModel:
    """A fitted pipeline plus a Platt (1-D logistic) calibrator fitted on later, held-out runs."""

    def __init__(self, base: Any, calibrator: LogisticRegression):
        self.base = base
        self.calibrator = calibrator

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        raw = self.base.predict_proba(X)[:, 1]
        cal = self.calibrator.predict_proba(_logit(raw).reshape(-1, 1))[:, 1]
        return np.column_stack([1 - cal, cal])


@dataclass
class Experiment:
    seed: int
    candidate_kind: str
    n_train: int
    n_val: int
    n_test: int
    windows: dict[str, dict[str, str]]
    metrics: dict[str, dict[str, Any]]  # test-set scores: majority, logreg, candidate
    thresholds: list[dict[str, float]]  # candidate, on the test set
    pr_curves: dict[str, list[dict[str, float]]]
    reliability: dict[str, list[dict[str, float]]]
    importances: dict[str, float]
    reference: dict[str, Any]
    leakage_violations: list[str]
    gate: GateDecision
    model: CalibratedModel


def _window(frame: pd.DataFrame, idx: pd.Index) -> dict[str, str]:
    started = frame.loc[idx, "started_at"]
    return {"from": started.min().isoformat(), "to": started.max().isoformat()}


def run_experiment(
    runs: pd.DataFrame,
    *,
    seed: int,
    candidate_kind: str = "hist_gb",
    precision_target: float = 0.5,
    gate_margin: float = 0.02,
    brier_tolerance: float = 0.002,
    rolling_window: int = 20,
) -> Experiment:
    """Train and compare on finished runs. ``runs`` needs pre-run columns plus finished_at, failed."""
    runs = runs.reset_index(drop=True)
    if len(runs) < MIN_RUNS:
        raise ValueError(f"Need at least {MIN_RUNS} finished runs to train; found {len(runs)}.")
    if runs["failed"].nunique() < 2:
        raise ValueError("Every finished run has the same outcome, so there is nothing to learn.")

    X = build_features(runs, runs, window=rolling_window)
    y = runs["failed"].astype(int).to_numpy()
    tr, va, te = time_split(runs)
    X_tr, X_va, X_te = X.loc[tr], X.loc[va], X.loc[te]
    y_tr, y_va, y_te = y[tr.to_numpy()], y[va.to_numpy()], y[te.to_numpy()]

    fitted = {}
    for name, kind in (("majority", "majority"), ("logreg", "logreg"), ("candidate", candidate_kind)):
        est = build_estimator(kind, seed)
        est.fit(X_tr, y_tr)
        fitted[name] = est

    raw_va = fitted["candidate"].predict_proba(X_va)[:, 1]
    calibrator = LogisticRegression(C=1e6, max_iter=1000).fit(_logit(raw_va).reshape(-1, 1), y_va)
    candidate = CalibratedModel(fitted["candidate"], calibrator)

    probs_te = {
        "majority": fitted["majority"].predict_proba(X_te)[:, 1],
        "logreg": fitted["logreg"].predict_proba(X_te)[:, 1],
        "candidate": candidate.predict_proba(X_te)[:, 1],
    }
    metrics = {k: evaluate.score(y_te, p, precision_target) for k, p in probs_te.items()}
    raw_te = fitted["candidate"].predict_proba(X_te)[:, 1]
    metrics["candidate"]["brier_uncalibrated"] = evaluate.score(y_te, raw_te, precision_target)["brier"]

    importance = permutation_importance(
        fitted["candidate"], X_va, y_va, scoring="average_precision", n_repeats=5, random_state=seed
    )
    importances = {
        col: round(float(v), 5)
        for col, v in sorted(
            zip(X_va.columns, importance.importances_mean, strict=True), key=lambda kv: -kv[1]
        )
    }
    reference: dict[str, Any] = {c: X_tr[c].median() for c in NUMERIC_FEATURES}
    reference.update({c: X_tr[c].mode().iloc[0] for c in CATEGORICAL_FEATURES})

    violations = check_columns(X.columns)
    gate = evaluate_gate(metrics, violations, margin=gate_margin, brier_tolerance=brier_tolerance)
    return Experiment(
        seed=seed,
        candidate_kind=candidate_kind,
        n_train=len(tr),
        n_val=len(va),
        n_test=len(te),
        windows={"train": _window(runs, tr), "validation": _window(runs, va), "test": _window(runs, te)},
        metrics=metrics,
        thresholds=evaluate.threshold_table(y_te, probs_te["candidate"]),
        pr_curves={k: evaluate.pr_curve_points(y_te, p) for k, p in probs_te.items()},
        reliability={
            "candidate": evaluate.reliability_points(y_te, probs_te["candidate"]),
            "logreg": evaluate.reliability_points(y_te, probs_te["logreg"]),
        },
        importances=importances,
        reference={k: (v.item() if hasattr(v, "item") else v) for k, v in reference.items()},
        leakage_violations=violations,
        gate=gate,
        model=candidate,
    )


__all__ = ["CANDIDATE_KINDS", "FEATURE_COLUMNS", "Experiment", "run_experiment", "build_estimator"]
