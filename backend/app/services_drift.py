"""Service for computing distribution drift between model training window and recent live runs."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from .contract import CATEGORICAL_FEATURES, NUMERIC_FEATURES, PRE_RUN_COLUMNS
from .ml.drift import calculate_ks, calculate_psi, category_shares, classify_psi
from .ml.features import build_features
from .orm import ModelRecord, Run
from .schemas import CategoricalDriftRow, CategoryShare, DriftReportOut, NumericDriftRow
from .services_data import NotFound, finished_runs_frame
from .services_models import active_model, get_model


def compute_drift(
    db: Session,
    recent_runs: int = 100,
    model_id: int | None = None,
) -> DriftReportOut:
    """Compute PSI, KS test and category share drift comparing training window to recent live runs."""
    model: ModelRecord | None
    if model_id is not None:
        model = get_model(db, model_id)
    else:
        model = active_model(db)
        if model is None:
            model = db.scalar(select(ModelRecord).order_by(ModelRecord.id.desc()))

    if model is None:
        raise NotFound(
            "No trained model found. Train a model first to establish the reference training window."
        )

    windows = model.report.get("windows", {})
    train_win = windows.get("train")
    if not train_win or "from" not in train_win or "to" not in train_win:
        raise NotFound(f"Model {model.version} does not have recorded training window metadata.")

    train_from = pd.to_datetime(train_win["from"])
    train_to = pd.to_datetime(train_win["to"])

    run_rows = db.scalars(select(Run).order_by(Run.started_at, Run.id)).all()
    if not run_rows:
        raise NotFound("No runs found in database.")

    runs_df = pd.DataFrame([{c: getattr(r, c) for c in PRE_RUN_COLUMNS} for r in run_rows])
    runs_df["started_at"] = pd.to_datetime(runs_df["started_at"])

    ref_mask = (runs_df["started_at"] >= train_from) & (runs_df["started_at"] <= train_to)
    ref_df = runs_df[ref_mask]
    if ref_df.empty:
        raise NotFound("No reference runs found within the model training window.")

    test_win = windows.get("test")
    if test_win and "to" in test_win:
        test_to = pd.to_datetime(test_win["to"])
        live_df = runs_df[runs_df["started_at"] > test_to]
    else:
        live_df = runs_df[runs_df["started_at"] > train_to]

    if live_df.empty:
        raise NotFound(
            "No live runs found after the model evaluation window. Add live runs to inspect drift."
        )

    if len(live_df) > recent_runs:
        live_df = live_df.tail(recent_runs)

    finished = finished_runs_frame(db)
    ref_feats = build_features(ref_df, finished)
    live_feats = build_features(live_df, finished)

    numeric_rows: list[NumericDriftRow] = []
    for col in NUMERIC_FEATURES:
        if col not in ref_feats.columns or col not in live_feats.columns:
            continue
        r_vals = ref_feats[col].dropna().to_numpy()
        l_vals = live_feats[col].dropna().to_numpy()
        psi = calculate_psi(r_vals, l_vals)
        ks_stat, ks_pval = calculate_ks(r_vals, l_vals)
        status, rec = classify_psi(psi)
        r_m = float(np.round(np.mean(r_vals), 3)) if len(r_vals) > 0 else 0.0
        l_m = float(np.round(np.mean(l_vals), 3)) if len(l_vals) > 0 else 0.0
        r_s = float(np.round(np.std(r_vals), 3)) if len(r_vals) > 0 else 0.0
        l_s = float(np.round(np.std(l_vals), 3)) if len(l_vals) > 0 else 0.0
        numeric_rows.append(
            NumericDriftRow(
                feature=col,
                psi=psi,
                ks_statistic=ks_stat,
                ks_pvalue=ks_pval,
                status=status,
                reference_mean=r_m,
                live_mean=l_m,
                reference_std=r_s,
                live_std=l_s,
                recommendation=rec,
            )
        )

    # Sort numeric features descending by PSI
    numeric_rows.sort(key=lambda r: r.psi, reverse=True)

    categorical_rows: list[CategoricalDriftRow] = []
    for col in CATEGORICAL_FEATURES:
        if col not in ref_feats.columns or col not in live_feats.columns:
            continue
        cat_psi, shares = category_shares(ref_feats[col], live_feats[col])
        status, rec = classify_psi(cat_psi)
        categorical_rows.append(
            CategoricalDriftRow(
                feature=col,
                psi=cat_psi,
                status=status,
                recommendation=rec,
                shares=[CategoryShare(**s) for s in shares],
            )
        )

    # Sort categorical features descending by PSI
    categorical_rows.sort(key=lambda r: r.psi, reverse=True)

    # Overall status across all features
    all_statuses = [r.status for r in numeric_rows] + [r.status for r in categorical_rows]
    if "shifted" in all_statuses:
        overall_status = "shifted"
    elif "watch" in all_statuses:
        overall_status = "watch"
    else:
        overall_status = "stable"

    return DriftReportOut(
        model_version=model.version,
        reference_window={
            "from": ref_df["started_at"].min().isoformat(),
            "to": ref_df["started_at"].max().isoformat(),
        },
        live_window={
            "from": live_df["started_at"].min().isoformat(),
            "to": live_df["started_at"].max().isoformat(),
        },
        n_reference=len(ref_df),
        n_live=len(live_df),
        overall_status=overall_status,
        numeric_features=numeric_rows,
        categorical_features=categorical_rows,
    )
